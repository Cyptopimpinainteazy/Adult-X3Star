'use strict';
/* Card photos are moderated uploads. Live previews resolve only a creator's explicitly linked room;
   the local live flag and gallery clips are never proof of a native broadcast. */
const { all, J } = require('./db');
const S = require('./services');
const CB = require('./cblive');
const BC = require('./bclive');
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
function sources() {
  const enabled = new Set(S.liveSites());
  const partners = S.econConfig().partners || {};
  return ['CB', 'BC']
    .filter((site) => enabled.has(site) && partners[site]?.enabled !== false)
    .map((site) => ({
      site,
      campaign: partners[site].campaign,
      program: partners[site].program,
      affiliateId: partners[site].affiliateId
    }));
}
function choicesFor(creator, configured) {
  if (creator.demo || !creator.live) return [];
  const handles = J(creator.handles, {});
  return configured.flatMap((source) => {
    const handle = handles && handles[source.site];
    const pattern = source.site === 'CB' ? CB.ROOM_RE : BC.ROOM_RE;
    return typeof handle === 'string' && pattern.test(handle) ? [{ ...source, handle }] : [];
  });
}
function forRows(creators) {
  const ids = [
    ...new Set(creators.flatMap((creator) => [creator.avatar_upload_id, creator.cover_upload_id]).filter(Boolean))
  ];
  const uploads = ids.length
    ? all(
        "SELECT p.*,u.role AS uploader_role,u.banned AS uploader_banned FROM uploads p JOIN users u ON u.id=p.owner_id WHERE p.status='approved' AND p.id IN (" +
          ids.map(() => '?').join(',') +
          ')',
        ...ids
      )
    : [];
  const byId = new Map(uploads.map((upload) => [upload.id, upload]));
  const configured = sources();
  return new Map(
    creators.map((creator) => {
      let photo = null;
      for (const [uploadId, kind] of [
        [creator.avatar_upload_id, 'avatar'],
        [creator.cover_upload_id, 'cover']
      ]) {
        const image = byId.get(uploadId);
        if (
          !image ||
          image.creator_id !== creator.id ||
          image.kind !== kind ||
          !IMAGE_TYPES.has(image.mime) ||
          (image.owner_id !== creator.user_id && (image.uploader_role !== 'admin' || image.uploader_banned)) ||
          !/^[A-Za-z0-9_-]+\.(?:jpe?g|png|webp|gif)$/i.test(image.file)
        )
          continue;
        photo = { url: '/uploads/' + encodeURIComponent(image.file), alt: creator.name + ' profile photo' };
        break;
      }
      return [
        creator.id,
        {
          photo,
          previewUrl: choicesFor(creator, configured).length
            ? '/api/network/talent/' + encodeURIComponent(creator.id) + '/preview'
            : null
        }
      ];
    })
  );
}
function validatedEmbed(value, choice) {
  if (typeof value !== 'string' || value.length > 2000 || /\s/.test(value)) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return null;
  const entries = [...url.searchParams];
  if (new Set(entries.map(([key]) => key)).size !== entries.length) return null;
  if (choice.site === 'CB') {
    const allowed = new Set(['tour', 'campaign', 'track', 'room', 'disable_sound', 'bgcolor']);
    if (
      !['chaturbate.com', 'www.chaturbate.com'].includes(url.hostname) ||
      url.pathname !== '/in/' ||
      entries.some(([key]) => !allowed.has(key)) ||
      url.searchParams.get('campaign') !== choice.campaign ||
      url.searchParams.get('room') !== choice.handle ||
      url.searchParams.get('disable_sound') !== '1'
    )
      return null;
  } else {
    const hostAllowed =
      ['bongacams.com', 'bngprm.com', 'bngpt.com'].includes(url.hostname) || url.hostname.endsWith('.bongacams.com');
    if (
      !hostAllowed ||
      url.pathname !== '/chat-frame.php' ||
      entries.some(([key]) => !['c', 'model'].includes(key)) ||
      url.searchParams.get('c') !== String(choice.affiliateId) ||
      url.searchParams.get('model') !== choice.handle
    )
      return null;
  }
  return url.href;
}
function sameSource(a, b) {
  return (
    a.site === b.site &&
    a.handle === b.handle &&
    a.campaign === b.campaign &&
    a.program === b.program &&
    String(a.affiliateId) === String(b.affiliateId)
  );
}
async function resolvePreview(loadCreator, ip) {
  const creator = loadCreator();
  if (creator.demo) return { available: false, reason: 'demo' };
  if (!creator.live) return { available: false, reason: 'offline' };
  const choices = choicesFor(creator, sources());
  if (!choices.length) return { available: false, reason: 'not_configured' };
  // Both adapters have their own finite request timeout. Parallel lookup stays within
  // the client's aggregate deadline even when one provider is unavailable.
  const results = await Promise.allSettled(
    choices.map((choice) =>
      choice.site === 'CB'
        ? CB.liveRooms({ campaign: choice.campaign, program: choice.program, ip, publicOnly: true })
        : BC.liveRooms({ affiliateId: String(choice.affiliateId), publicOnly: true })
    )
  );
  const current = loadCreator(); // Rechecks approved creator + active owner after I/O.
  if (current.demo) return { available: false, reason: 'demo' };
  if (!current.live) return { available: false, reason: 'offline' };
  const currentChoices = choicesFor(current, sources());
  if (!currentChoices.length) return { available: false, reason: 'not_configured' };
  for (let i = 0; i < choices.length; i++) {
    const choice = choices[i],
      result = results[i];
    if (!currentChoices.some((candidate) => sameSource(choice, candidate)) || result.status !== 'fulfilled') continue;
    const response = result.value;
    if (!response || response.stale || response.error || !Array.isArray(response.rooms)) continue;
    const room = response.rooms.find((room) => room.room === choice.handle && room.show === 'public');
    const src = room && validatedEmbed(room.embed, choice);
    if (!src) continue;
    return {
      available: true,
      kind: 'iframe',
      site: choice.site,
      src,
      href: '/go/' + choice.site + '/r/' + encodeURIComponent(choice.handle),
      muted: choice.site === 'CB',
      checkedAt: Date.now()
    };
  }
  return { available: false, reason: 'unavailable' };
}
module.exports = { forRows, resolvePreview };
