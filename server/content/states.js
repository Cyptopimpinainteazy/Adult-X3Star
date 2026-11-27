'use strict';
/* Editorial state profiles. Directory-only entries stay outside search indexing. */
const STATES = [
  {
    "name": "Alabama",
    "code": "AL",
    "slug": "alabama",
    "cities": [
      "Birmingham",
      "Montgomery",
      "Mobile"
    ],
    "intro": "Planning an online creator inquiry from Birmingham, Montgomery, Mobile or elsewhere in Alabama? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "Alaska",
    "code": "AK",
    "slug": "alaska",
    "cities": [
      "Anchorage",
      "Fairbanks",
      "Juneau"
    ],
    "intro": "Planning an online creator inquiry from Anchorage, Fairbanks, Juneau or elsewhere in Alaska? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "Arizona",
    "code": "AZ",
    "slug": "arizona",
    "cities": [
      "Phoenix",
      "Tucson",
      "Flagstaff"
    ],
    "intro": "Planning an online creator inquiry from Phoenix, Tucson, Flagstaff or elsewhere in Arizona? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "Arkansas",
    "code": "AR",
    "slug": "arkansas",
    "cities": [
      "Little Rock",
      "Fayetteville",
      "Fort Smith"
    ],
    "intro": "Planning an online creator inquiry from Little Rock, Fayetteville, Fort Smith or elsewhere in Arkansas? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "California",
    "code": "CA",
    "slug": "california",
    "cities": [
      "Los Angeles",
      "San Diego",
      "Sacramento"
    ],
    "intro": "Planning an online creator application from Los Angeles, San Diego, Sacramento or elsewhere in California? Start with a private workspace and a repeatable schedule, then compare the x3STAR review process with a separate partner application.",
    "indexable": true,
    "updated": "2026-11-27",
    "sections": [
      {
        "heading": "Plan the room around your actual home",
        "paragraphs": [
          "A small room can be enough for a rehearsal; it does not need to resemble a commercial studio. In a shared California apartment, inspect the camera frame for balcony views, apartment signage, delivery labels and reflections. Ask everyone sharing the space to respect a recording boundary, and keep people who have not agreed to participate away from the frame and microphone.",
          "Test your connection at the hours you would actually use it. A daytime result from an otherwise empty household does not tell you how an evening session will behave. Save a short local recording and listen with headphones for street noise, neighbors, ventilation and identifying announcements. Solve those issues before buying a camera upgrade."
        ]
      },
      {
        "heading": "Keep a California planning file",
        "paragraphs": [
          "CalOSBA’s setup guide is an official starting point for researching business structure, location and registration questions. Follow its links to the relevant authorities for your circumstances; a state guide does not answer every city, lease or platform question. If you ask an adviser for help, explain the nature of your proposed work before assuming their services cover it.",
          "Write your availability with a named time zone, a start and end time, and a realistic break. Keep equipment receipts and a record of time spent on setup as well as sessions. Those records help you compare the cost of testing an idea with actual results, without treating an application or an on-screen balance as a promise of income."
        ]
      },
      {
        "heading": "Choose the application you mean to submit",
        "paragraphs": [
          "The x3STAR form sends your stage name, contact email and preferences to its review queue. It does not reserve a California studio, create a scheduled audition or complete identity verification. The partner button starts a separate process on that provider’s site. Read its current requirements before sharing information, and never attach identity documents to this public inquiry form."
        ]
      }
    ],
    "resources": [
      {
        "label": "CalOSBA: Set Up Your Business in California",
        "url": "https://calosba.ca.gov/for-small-businesses-and-non-profits/set-up-your-business-in-california/"
      }
    ],
    "related": [
      "oregon",
      "nevada",
      "arizona"
    ]
  },
  {
    "name": "Colorado",
    "code": "CO",
    "slug": "colorado",
    "cities": [
      "Denver",
      "Colorado Springs",
      "Fort Collins"
    ],
    "intro": "For prospective creators in Denver, Colorado Springs, Fort Collins and the rest of Colorado, this is an online application route. Build a plan for privacy, a reliable setup and your available hours before choosing x3STAR or an independent partner.",
    "indexable": true,
    "updated": "2026-11-27",
    "sections": [
      {
        "heading": "Rehearse for the room you will use",
        "paragraphs": [
          "Plan around your actual address and connection rather than assuming that a nearby city’s service is available to you. Before committing to equipment, test a local recording at your intended session time. Check light as it changes, listen for heating and fan noise, and confirm that a household member can interrupt you without appearing in the recording.",
          "Colorado views can be recognizable. Review windows, mirrors, outdoor photos, sports or workplace clothing, and mail before using a room on camera. A plain curtain or a different camera angle can reduce what a frame reveals. A stage name helps separate accounts, but it cannot guarantee anonymity or prevent a viewer from saving material."
        ]
      },
      {
        "heading": "Research names before making them public",
        "paragraphs": [
          "The Colorado Secretary of State’s Business Organizations page links to official business-startup education, name tools and filing information. Use those resources to build a list of questions about your own plans. A public-facing creator name, an account username and a legal business name serve different purposes; one being available does not establish rights to the others.",
          "Keep legal paperwork separate from your public profile. Before submitting any filing, review which information becomes public and ask the appropriate authority or a qualified adviser about your options. Do not use a public casting note to send your home address, identification images or financial account information. This page cannot determine what registrations or permissions your situation requires."
        ]
      },
      {
        "heading": "Make availability specific",
        "paragraphs": [
          "Write down two or three workable session windows, each with its time zone and a clear finishing time. Include setup and cleanup in the commitment. The x3STAR form is a request for review, not a Colorado audition appointment or an acceptance notice. A partner application has separate terms, verification and availability rules; choosing that route does not also submit an x3STAR application."
        ]
      }
    ],
    "resources": [
      {
        "label": "Colorado Secretary of State: Business Organizations",
        "url": "https://www.sos.state.co.us/pubs/business/businessHome.html"
      }
    ],
    "related": [
      "wyoming",
      "utah",
      "new-mexico"
    ]
  },
  {
    "name": "Connecticut",
    "code": "CT",
    "slug": "connecticut",
    "cities": [
      "Hartford",
      "New Haven",
      "Stamford"
    ],
    "intro": "Planning an online creator inquiry from Hartford, New Haven, Stamford or elsewhere in Connecticut? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "Delaware",
    "code": "DE",
    "slug": "delaware",
    "cities": [
      "Wilmington",
      "Dover",
      "Newark"
    ],
    "intro": "Planning an online creator inquiry from Wilmington, Dover, Newark or elsewhere in Delaware? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "Florida",
    "code": "FL",
    "slug": "florida",
    "cities": [
      "Miami",
      "Orlando",
      "Tampa"
    ],
    "intro": "Applying online from Miami, Orlando, Tampa or another Florida community starts with the same decision: request x3STAR review or apply independently to a partner. Use the planning notes below to prepare a workspace and a schedule you can sustain.",
    "indexable": true,
    "updated": "2026-11-27",
    "sections": [
      {
        "heading": "Write down the time zone, not just the hour",
        "paragraphs": [
          "Florida has more than one time zone, so a schedule labeled only “8 pm Florida time” can confuse viewers and collaborators. Name the time zone you actually use and check the displayed time when arranging anything with someone elsewhere. Keep a private calendar for preparation, sessions, breaks and other obligations, rather than publishing details of your daily movements.",
          "Try two realistic rehearsal windows before promising a recurring schedule. Listen for traffic and household noise, and check whether your connection stays stable while other people are online. Do not interpret a single smooth recording as evidence that every future live session will work. Keep a simple stop-and-reschedule plan for an unreliable connection or an interrupted private workspace."
        ]
      },
      {
        "heading": "Match planning help to your region",
        "paragraphs": [
          "The Florida SBDC Network is a starting point for finding regional business-planning resources, training and consulting information. Its location directory can help you identify whom to ask instead of assuming that one office handles the whole state. Check service availability and whether an adviser can discuss an adult-industry business before supplying detailed personal information.",
          "Prepare questions about record organization, startup costs and the assumptions in your budget. A planning resource is not an endorsement of a platform or proof that a proposed activity is permitted. Keep receipts, separate estimates from money actually received, and take questions about specific obligations to the appropriate authority or professional."
        ]
      },
      {
        "heading": "Keep inquiry and verification separate",
        "paragraphs": [
          "This inquiry form needs a stage name and a contact email, not a Florida address, identity document or banking details. Submitting it records an application for review; it does not arrange an in-person casting or promise acceptance. The partner route leaves x3STAR for a different application with its own requirements, review decisions and verification process."
        ]
      }
    ],
    "resources": [
      {
        "label": "Florida SBDC Network: Regional Business Planning Resources",
        "url": "https://floridasbdc.org/"
      }
    ],
    "related": [
      "georgia",
      "alabama",
      "south-carolina"
    ]
  },
  {
    "name": "Georgia",
    "code": "GA",
    "slug": "georgia",
    "cities": [
      "Atlanta",
      "Augusta",
      "Savannah"
    ],
    "intro": "Planning an online creator inquiry from Atlanta, Augusta, Savannah or elsewhere in Georgia? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "Hawaii",
    "code": "HI",
    "slug": "hawaii",
    "cities": [
      "Honolulu",
      "Hilo",
      "Kailua-Kona"
    ],
    "intro": "Planning an online creator inquiry from Honolulu, Hilo, Kailua-Kona or elsewhere in Hawaii? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "Idaho",
    "code": "ID",
    "slug": "idaho",
    "cities": [
      "Boise",
      "Idaho Falls",
      "Coeur d'Alene"
    ],
    "intro": "Planning an online creator inquiry from Boise, Idaho Falls, Coeur d'Alene or elsewhere in Idaho? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "Illinois",
    "code": "IL",
    "slug": "illinois",
    "cities": [
      "Chicago",
      "Springfield",
      "Peoria"
    ],
    "intro": "Planning an online creator inquiry from Chicago, Springfield, Peoria or elsewhere in Illinois? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "Indiana",
    "code": "IN",
    "slug": "indiana",
    "cities": [
      "Indianapolis",
      "Fort Wayne",
      "Evansville"
    ],
    "intro": "Planning an online creator inquiry from Indianapolis, Fort Wayne, Evansville or elsewhere in Indiana? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "Iowa",
    "code": "IA",
    "slug": "iowa",
    "cities": [
      "Des Moines",
      "Cedar Rapids",
      "Davenport"
    ],
    "intro": "Planning an online creator inquiry from Des Moines, Cedar Rapids, Davenport or elsewhere in Iowa? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "Kansas",
    "code": "KS",
    "slug": "kansas",
    "cities": [
      "Wichita",
      "Topeka",
      "Overland Park"
    ],
    "intro": "Planning an online creator inquiry from Wichita, Topeka, Overland Park or elsewhere in Kansas? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "Kentucky",
    "code": "KY",
    "slug": "kentucky",
    "cities": [
      "Louisville",
      "Lexington",
      "Bowling Green"
    ],
    "intro": "Planning an online creator inquiry from Louisville, Lexington, Bowling Green or elsewhere in Kentucky? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "Louisiana",
    "code": "LA",
    "slug": "louisiana",
    "cities": [
      "New Orleans",
      "Baton Rouge",
      "Shreveport"
    ],
    "intro": "Planning an online creator inquiry from New Orleans, Baton Rouge, Shreveport or elsewhere in Louisiana? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "Maine",
    "code": "ME",
    "slug": "maine",
    "cities": [
      "Portland",
      "Bangor",
      "Augusta"
    ],
    "intro": "Planning an online creator inquiry from Portland, Bangor, Augusta or elsewhere in Maine? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "Maryland",
    "code": "MD",
    "slug": "maryland",
    "cities": [
      "Baltimore",
      "Annapolis",
      "Frederick"
    ],
    "intro": "Planning an online creator inquiry from Baltimore, Annapolis, Frederick or elsewhere in Maryland? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "Massachusetts",
    "code": "MA",
    "slug": "massachusetts",
    "cities": [
      "Boston",
      "Worcester",
      "Springfield"
    ],
    "intro": "Planning an online creator inquiry from Boston, Worcester, Springfield or elsewhere in Massachusetts? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "Michigan",
    "code": "MI",
    "slug": "michigan",
    "cities": [
      "Detroit",
      "Grand Rapids",
      "Lansing"
    ],
    "intro": "Planning an online creator inquiry from Detroit, Grand Rapids, Lansing or elsewhere in Michigan? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "Minnesota",
    "code": "MN",
    "slug": "minnesota",
    "cities": [
      "Minneapolis",
      "Saint Paul",
      "Duluth"
    ],
    "intro": "Planning an online creator inquiry from Minneapolis, Saint Paul, Duluth or elsewhere in Minnesota? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "Mississippi",
    "code": "MS",
    "slug": "mississippi",
    "cities": [
      "Jackson",
      "Gulfport",
      "Hattiesburg"
    ],
    "intro": "Planning an online creator inquiry from Jackson, Gulfport, Hattiesburg or elsewhere in Mississippi? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "Missouri",
    "code": "MO",
    "slug": "missouri",
    "cities": [
      "Kansas City",
      "Saint Louis",
      "Springfield"
    ],
    "intro": "Planning an online creator inquiry from Kansas City, Saint Louis, Springfield or elsewhere in Missouri? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "Montana",
    "code": "MT",
    "slug": "montana",
    "cities": [
      "Billings",
      "Missoula",
      "Great Falls"
    ],
    "intro": "Planning an online creator inquiry from Billings, Missoula, Great Falls or elsewhere in Montana? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "Nebraska",
    "code": "NE",
    "slug": "nebraska",
    "cities": [
      "Omaha",
      "Lincoln",
      "Kearney"
    ],
    "intro": "Planning an online creator inquiry from Omaha, Lincoln, Kearney or elsewhere in Nebraska? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "Nevada",
    "code": "NV",
    "slug": "nevada",
    "cities": [
      "Las Vegas",
      "Reno",
      "Carson City"
    ],
    "intro": "Las Vegas, Reno and Carson City are examples of places applicants may live, not x3STAR studio locations. This Nevada route is for online inquiries, with separate choices for x3STAR review and partner registration.",
    "indexable": true,
    "updated": "2026-11-27",
    "sections": [
      {
        "heading": "Separate an online inquiry from local casting",
        "paragraphs": [
          "A state page should not be mistaken for an appointment at a venue. There is no Nevada studio visit or local audition attached to this form. If someone contacts you claiming otherwise, verify who they represent through the provider’s published channels before traveling, paying a fee or sharing documents. An online application alone is not a work offer or an acceptance notice.",
          "Write down what you want to ask a reviewer: how verification is handled, what features are available, what the current terms say and who handles support. Answers should come from the provider responsible for the application. A partner referral and an x3STAR inquiry are separate processes, even when both links appear on this page."
        ]
      },
      {
        "heading": "Research the right local questions",
        "paragraphs": [
          "Nevada’s Department of Business and Industry maintains a Business Resource Hub with planning and licensing-information routes. Use it to find the relevant official starting points for your circumstances. Do not assume that a familiar entertainment city, an available username or an approved platform account answers a local business question.",
          "Keep a private list of the questions you need answered before spending money. Include the proposed workspace, any shared-property restrictions, the total equipment budget and how you will organize records. Ask resource providers whether they can advise an adult-industry business. These links are references, not an endorsement or a determination of eligibility."
        ]
      },
      {
        "heading": "Design a practical session window",
        "paragraphs": [
          "Use a named time zone when scheduling; do not assume every Nevada participant uses the same clock. Rehearse with your normal lighting, cooling and household activity, then listen to the recording for background noise. Check curtains, mirrors, recognizable views and delivery labels. Keep a clear stopping procedure so an interruption does not turn into an accidental broadcast of someone else."
        ]
      }
    ],
    "resources": [
      {
        "label": "Nevada Business and Industry: Business Resource Hub",
        "url": "https://www.business.nv.gov/business-resource-hub/"
      }
    ],
    "related": [
      "california",
      "utah",
      "arizona"
    ]
  },
  {
    "name": "New Hampshire",
    "code": "NH",
    "slug": "new-hampshire",
    "cities": [
      "Manchester",
      "Concord",
      "Portsmouth"
    ],
    "intro": "Planning an online creator inquiry from Manchester, Concord, Portsmouth or elsewhere in New Hampshire? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "New Jersey",
    "code": "NJ",
    "slug": "new-jersey",
    "cities": [
      "Newark",
      "Trenton",
      "Jersey City"
    ],
    "intro": "Planning an online creator inquiry from Newark, Trenton, Jersey City or elsewhere in New Jersey? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "New Mexico",
    "code": "NM",
    "slug": "new-mexico",
    "cities": [
      "Albuquerque",
      "Santa Fe",
      "Las Cruces"
    ],
    "intro": "Planning an online creator inquiry from Albuquerque, Santa Fe, Las Cruces or elsewhere in New Mexico? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "New York",
    "code": "NY",
    "slug": "new-york",
    "cities": [
      "New York City",
      "Buffalo",
      "Albany"
    ],
    "intro": "An applicant in New York City, Buffalo, Albany or elsewhere in New York can begin with an online inquiry. Prepare your privacy and scheduling plan first, then choose between x3STAR review and a separate partner application.",
    "indexable": true,
    "updated": "2026-11-27",
    "sections": [
      {
        "heading": "Make a shared-space plan first",
        "paragraphs": [
          "Before arranging a recurring session, confirm that you have a space where other people will not appear or be overheard without agreement. A closed door is only part of the check. Record a short rehearsal and listen for names, building announcements, nearby conversations and recognizable outside sounds. Move paperwork, photos and work or school identifiers out of view.",
          "If you share a small apartment or a busy household, choose a schedule with the people using that space in mind. Include preparation and finishing time rather than describing only the minutes on camera. You do not need to publish your neighborhood, commute or household schedule to explain when a creator account is available."
        ]
      },
      {
        "heading": "Distinguish state resources from city questions",
        "paragraphs": [
          "The New York State Business Startup Guide provides official routes into business structure, registration and assistance research. Start there to identify the questions that fit your plans, then check the relevant authorities for your specific location. A state resource does not establish that a particular lease, address or proposed activity is suitable.",
          "Keep your research notes and legal records away from your public profile. Before submitting information to a public registry, review what will be visible and ask the relevant office or a qualified adviser about your circumstances. The stage name in this application is for a creator inquiry; it is not a business registration or a guarantee of anonymity."
        ]
      },
      {
        "heading": "Compare application paths without rushing",
        "paragraphs": [
          "Use a separate contact email you can monitor, and write availability with a named time zone. The x3STAR form stores an inquiry for review and does not complete identity verification or activate live broadcasting. Partner applications follow the other provider’s rules and decisions. Read those current terms before sharing information, and do not put identity images, a home address or banking details in the public notes field."
        ]
      }
    ],
    "resources": [
      {
        "label": "New York State: Business Startup Guide",
        "url": "https://www.ny.gov/services/new-york-state-business-startup-guide"
      }
    ],
    "related": [
      "new-jersey",
      "connecticut",
      "pennsylvania"
    ]
  },
  {
    "name": "North Carolina",
    "code": "NC",
    "slug": "north-carolina",
    "cities": [
      "Charlotte",
      "Raleigh",
      "Asheville"
    ],
    "intro": "Planning an online creator inquiry from Charlotte, Raleigh, Asheville or elsewhere in North Carolina? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "North Dakota",
    "code": "ND",
    "slug": "north-dakota",
    "cities": [
      "Fargo",
      "Bismarck",
      "Grand Forks"
    ],
    "intro": "Planning an online creator inquiry from Fargo, Bismarck, Grand Forks or elsewhere in North Dakota? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "Ohio",
    "code": "OH",
    "slug": "ohio",
    "cities": [
      "Columbus",
      "Cleveland",
      "Cincinnati"
    ],
    "intro": "Planning an online creator inquiry from Columbus, Cleveland, Cincinnati or elsewhere in Ohio? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "Oklahoma",
    "code": "OK",
    "slug": "oklahoma",
    "cities": [
      "Oklahoma City",
      "Tulsa",
      "Norman"
    ],
    "intro": "Planning an online creator inquiry from Oklahoma City, Tulsa, Norman or elsewhere in Oklahoma? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "Oregon",
    "code": "OR",
    "slug": "oregon",
    "cities": [
      "Portland",
      "Salem",
      "Eugene"
    ],
    "intro": "Planning an online creator inquiry from Portland, Salem, Eugene or elsewhere in Oregon? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "Pennsylvania",
    "code": "PA",
    "slug": "pennsylvania",
    "cities": [
      "Philadelphia",
      "Pittsburgh",
      "Harrisburg"
    ],
    "intro": "Planning an online creator inquiry from Philadelphia, Pittsburgh, Harrisburg or elsewhere in Pennsylvania? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "Rhode Island",
    "code": "RI",
    "slug": "rhode-island",
    "cities": [
      "Providence",
      "Warwick",
      "Newport"
    ],
    "intro": "Planning an online creator inquiry from Providence, Warwick, Newport or elsewhere in Rhode Island? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "South Carolina",
    "code": "SC",
    "slug": "south-carolina",
    "cities": [
      "Columbia",
      "Charleston",
      "Greenville"
    ],
    "intro": "Planning an online creator inquiry from Columbia, Charleston, Greenville or elsewhere in South Carolina? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "South Dakota",
    "code": "SD",
    "slug": "south-dakota",
    "cities": [
      "Sioux Falls",
      "Rapid City",
      "Pierre"
    ],
    "intro": "Planning an online creator inquiry from Sioux Falls, Rapid City, Pierre or elsewhere in South Dakota? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "Tennessee",
    "code": "TN",
    "slug": "tennessee",
    "cities": [
      "Nashville",
      "Memphis",
      "Knoxville"
    ],
    "intro": "Planning an online creator inquiry from Nashville, Memphis, Knoxville or elsewhere in Tennessee? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "Texas",
    "code": "TX",
    "slug": "texas",
    "cities": [
      "Houston",
      "Austin",
      "El Paso"
    ],
    "intro": "For applicants in Houston, Austin, El Paso and across Texas, this is an online creator inquiry. A useful starting plan covers your exact session hours, a private recording space and the difference between x3STAR review and a partner application.",
    "indexable": true,
    "updated": "2026-11-27",
    "sections": [
      {
        "heading": "Be precise about schedules and connection tests",
        "paragraphs": [
          "Texas spans more than one time zone. Use the zone for your actual location when sharing an availability window, particularly when coordinating between El Paso and other parts of the state. Include a finishing time and breaks. You can communicate a reliable creator schedule without revealing a home address or the details of your daily routine.",
          "Test the connection at the address and time you intend to use, rather than relying on a city-wide reputation for good service. Save a local rehearsal, then check the picture and sound with headphones. Note what happens when household devices are active. If a stable setup is not available, keep the activity at the planning stage instead of committing to a live schedule."
        ]
      },
      {
        "heading": "Use the state checklist as a research map",
        "paragraphs": [
          "The Texas Governor’s Office has a Start a Business resource that organizes planning questions and links to state and local information. Use it to identify where to ask about your specific circumstances. It does not replace checking a lease, a provider’s current terms or the requirements that apply to a proposed location and activity.",
          "Create a small planning file with your questions, estimated costs and equipment you already own. Keep receipts and distinguish test balances, pending amounts and money actually received. Ask any business-assistance provider whether it can help with an adult-industry business before assuming its program covers your plans. No resource linked here endorses x3STAR or guarantees an outcome."
        ]
      },
      {
        "heading": "Keep the first inquiry limited",
        "paragraphs": [
          "Send a stage name, a working contact email and a practical description of your availability. Do not include identity images, precise address information or financial account details. An x3STAR submission goes to its review queue; a partner button begins an independent process. Neither choice on this page schedules a Texas audition, reserves a studio or promises admission or earnings."
        ]
      }
    ],
    "resources": [
      {
        "label": "Texas Governor’s Office: Start a Business in Texas",
        "url": "https://gov.texas.gov/business/page/start-a-business"
      }
    ],
    "related": [
      "new-mexico",
      "oklahoma",
      "louisiana"
    ]
  },
  {
    "name": "Utah",
    "code": "UT",
    "slug": "utah",
    "cities": [
      "Salt Lake City",
      "Provo",
      "Ogden"
    ],
    "intro": "Planning an online creator inquiry from Salt Lake City, Provo, Ogden or elsewhere in Utah? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "Vermont",
    "code": "VT",
    "slug": "vermont",
    "cities": [
      "Burlington",
      "Montpelier",
      "Rutland"
    ],
    "intro": "Planning an online creator inquiry from Burlington, Montpelier, Rutland or elsewhere in Vermont? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "Virginia",
    "code": "VA",
    "slug": "virginia",
    "cities": [
      "Richmond",
      "Norfolk",
      "Roanoke"
    ],
    "intro": "Planning an online creator inquiry from Richmond, Norfolk, Roanoke or elsewhere in Virginia? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "Washington",
    "code": "WA",
    "slug": "washington",
    "cities": [
      "Seattle",
      "Spokane",
      "Olympia"
    ],
    "intro": "Planning an online creator inquiry from Seattle, Spokane, Olympia or elsewhere in Washington? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "West Virginia",
    "code": "WV",
    "slug": "west-virginia",
    "cities": [
      "Charleston",
      "Huntington",
      "Morgantown"
    ],
    "intro": "Planning an online creator inquiry from Charleston, Huntington, Morgantown or elsewhere in West Virginia? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "Wisconsin",
    "code": "WI",
    "slug": "wisconsin",
    "cities": [
      "Milwaukee",
      "Madison",
      "Green Bay"
    ],
    "intro": "Planning an online creator inquiry from Milwaukee, Madison, Green Bay or elsewhere in Wisconsin? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  },
  {
    "name": "Wyoming",
    "code": "WY",
    "slug": "wyoming",
    "cities": [
      "Cheyenne",
      "Casper",
      "Laramie"
    ],
    "intro": "Planning an online creator inquiry from Cheyenne, Casper, Laramie or elsewhere in Wyoming? Use this state entry to choose x3STAR review or a separate partner application. Confirm your own location requirements, privacy setup and availability before applying.",
    "indexable": false,
    "updated": "2026-11-27",
    "sections": [],
    "resources": [],
    "related": []
  }
];

function getState(value) {
  if (typeof value !== 'string') return undefined;
  const key = value.trim().toLowerCase();
  return STATES.find(state => state.slug === key || state.code.toLowerCase() === key);
}
module.exports = { STATES, getState };
