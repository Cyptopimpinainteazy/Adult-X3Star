'use strict';

/* Editorial reading paths. Article prose and the complete journal stay in articles.js. */
const TOPICS = [
  {
    slug: 'creators',
    title: 'Adult creator and model career guides',
    description: 'Explore adult creator and model career guides on choosing opportunities, building a portfolio and preparing for professional collaborations.',
    heading: 'Plan your next step as a creator or model.',
    intro: [
      'A creator opportunity can involve much more than the time spent on camera. Preparing samples, reviewing a brief, managing a schedule and deciding what to keep private are part of the work too. Start by considering the kind of role you want and the responsibilities you are willing to take on. These guides help adults researching creator and model careers turn that broad question into a few practical decisions.',
      'Follow the reading path in order if you are starting from scratch, or use the complete collection to find a specific task. You can prepare a portfolio without agreeing to a project, ask questions without committing to a platform and decide that an opportunity does not fit. An x3STAR application enters a review queue; it does not confirm eligibility, a booking or earnings. Independent partner applications follow each partner’s separate process.'
    ],
    steps: [
      {
        heading: 'Understand the opportunity before applying',
        description: 'Compare an ordinary working week with your own plans, then examine the platform or project being offered. Record the questions that need answers before you send a focused application.',
        articles: ['adult-content-creator-career-fit', 'questions-before-joining-a-creator-platform', 'read-a-casting-call']
      },
      {
        heading: 'Present your work clearly',
        description: 'Choose samples that support the work you want, explain your contribution and give people useful contact instructions. A clear availability post should describe something you can actually deliver.',
        articles: ['build-a-creator-portfolio', 'write-a-creator-bio', 'write-available-for-work-post']
      },
      {
        heading: 'Prepare a workable collaboration',
        description: 'Discuss scope and boundaries before production, make meetings serve a specific decision and keep a record of what you agreed. Revisit those decisions when the project or your availability changes.',
        articles: ['set-collaboration-boundaries', 'prepare-a-remote-creator-meeting', 'track-creator-business-decisions']
      }
    ],
    action: { href: '/casting#apply', label: 'Explore creator applications' }
  },
  {
    slug: 'affiliates',
    title: 'Adult affiliate marketing and publisher guides',
    description: 'Plan an adult-industry affiliate publication with guides to program terms, disclosures, useful content, tracking and publisher partnership proposals.',
    heading: 'Build a useful affiliate publication.',
    intro: [
      'An affiliate publication needs a reason for someone to read it before it needs a referral link. A useful comparison, a researched explanation or a practical planning guide can help an adult reader decide whether an opportunity deserves a closer look. Define the audience and the question you can answer, then check which commercial arrangements and promotional methods fit that work.',
      'This reading path moves from understanding a program to publishing and reviewing a small body of work. It keeps a tracked visit, a provider-reported outcome and money received as separate events. Use the complete collection for specific publishing tasks or prepare a proposal through x3STAR’s publisher inquiry page. Sending an inquiry starts a conversation for review; it does not activate an affiliate account, establish rates or promise commissions.'
    ],
    steps: [
      {
        heading: 'Check the relationship and its terms',
        description: 'Learn how publisher referrals work, compare the actual terms available to you and plan a disclosure readers can understand where they make a decision.',
        articles: ['affiliate-marketing-adult-industry-basics', 'compare-adult-affiliate-program-terms', 'affiliate-disclosure-examples']
      },
      {
        heading: 'Publish around real reader questions',
        description: 'Give your review site a focused purpose, support recommendations with original work and reserve time for research and maintenance in the publishing calendar.',
        articles: ['build-adult-affiliate-review-site', 'affiliate-content-for-search-readers', 'plan-an-affiliate-content-calendar']
      },
      {
        heading: 'Measure carefully and propose the next step',
        description: 'Understand what each link and report can establish before drawing conclusions. Use that evidence, your proposed deliverables and the questions still open to write a partnership proposal.',
        articles: ['affiliate-tracking-links-explained', 'review-affiliate-performance', 'write-a-publisher-partnership-proposal']
      }
    ],
    action: { href: '/partners#inquire', label: 'Discuss a publisher partnership' }
  },
  {
    slug: 'hiring',
    title: 'Adult-industry hiring and model recruitment guides',
    description: 'Prepare adult-industry hiring and model recruitment with guides to clear listings, portfolio reviews, interviews, paid assessments and onboarding.',
    heading: 'Recruit around a clear piece of work.',
    intro: [
      'Finding a model, editor or creator collaborator starts with explaining the opportunity. Prospective applicants need to understand the work, the proposed relationship, timing, compensation and how their materials would be used. Write those details before searching profiles or asking people to apply. The right listing format helps a candidate decide whether to have a conversation and gives your team a consistent basis for review.',
      'Use this reading path to prepare an opening, assess relevant work and manage the transition into a project. The complete collection also covers specialist roles, remote handoffs and applicant follow-ups. On x3STAR, free profile-board opportunities and reviewed paid employer listings serve different purposes. A public profile does not establish availability, an application is not a booking, and separate eligibility and verification processes still apply before participation.'
    ],
    steps: [
      {
        heading: 'Define the opening and choose its format',
        description: 'Distinguish a casting call from a job listing or collaboration proposal. State the deliverables and practical terms, then choose discovery routes that fit the opportunity you can explain.',
        articles: ['casting-call-vs-job-listing', 'write-adult-industry-job-description', 'find-models-for-your-production-team']
      },
      {
        heading: 'Review candidates against the project',
        description: 'Use observable project needs to review portfolios and prepare consistent interview questions. If an assessment is necessary, agree its scope, compensation and permitted use before anyone starts.',
        articles: ['evaluate-a-model-portfolio-respectfully', 'plan-a-creator-casting-interview', 'compensate-creator-test-projects']
      },
      {
        heading: 'Keep applications and listings current',
        description: 'Give applications a clear owner and status, confirm responsibilities before onboarding and maintain the public listing through closure. Keep applicant access limited to the people who need it.',
        articles: ['manage-inbound-casting-applications', 'onboard-a-creator-collaborator', 'renew-close-a-casting-listing']
      }
    ],
    action: { href: '/employers', label: 'Prepare an employer listing' }
  }
];

const getTopic = slug => TOPICS.find(topic => topic.slug === slug);
module.exports = { TOPICS, getTopic };
