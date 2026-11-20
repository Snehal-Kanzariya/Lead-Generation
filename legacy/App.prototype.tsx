import { useEffect, useMemo, useRef, useState } from "react";

/* ════════════════════════════════════════════════════════════════════════════
   LeadCaller AI — CRM for finding local businesses without websites and
   converting them via AI voice-agent outreach.

   Single-file app. All data access goes through the SERVICE LAYER section —
   swap those functions with real API calls (REST/GraphQL/Twilio/Vapi) later.
   ════════════════════════════════════════════════════════════════════════════ */

/* ────────────────────────────────────────────────
   TYPES
   ──────────────────────────────────────────────── */

type Industry =
  | "restaurant"
  | "cafe"
  | "salon"
  | "construction"
  | "gym"
  | "clinic"
  | "retail";

type Country = "India" | "USA" | "UK" | "Canada" | "Australia" | "UAE";

type WebsiteStatus = "none" | "broken" | "outdated";

type PipelineStage =
  | "New"
  | "Contacted"
  | "Interested"
  | "Proposal Sent"
  | "Won"
  | "Lost";

type CallOutcome = "interested" | "callback" | "not_interested" | "no_answer";

type CallStatus = "idle" | "dialing" | "connected" | "completed" | "no_answer";

interface Lead {
  id: string;
  name: string;
  industry: Industry;
  city: string;
  country: Country;
  phone: string;
  rating: number; // Google rating
  reviews: number;
  websiteStatus: WebsiteStatus;
  score: number; // 0-100 lead score
  stage: PipelineStage;
  assignedTo: string | null; // employee id
  notes: string;
  followUpDate: string; // yyyy-mm-dd or ""
  estimatedValue: number; // USD deal opportunity
}

interface Employee {
  id: string;
  name: string;
  role: "SDR" | "Closer" | "Account Manager" | "Researcher";
  countries: Country[];
  industries: Industry[];
  conversionRate: number; // %
  callsMade: number;
}

interface TranscriptLine {
  speaker: "agent" | "prospect";
  text: string;
}

interface CallRecord {
  id: string;
  leadId: string;
  timestamp: string; // ISO
  durationSec: number;
  outcome: CallOutcome;
  transcript: TranscriptLine[];
  agentName: string;
}

interface InsightCard {
  id: string;
  industry: Industry;
  country: Country | "Global";
  title: string;
  problems: string[];
  gapAnalysis: string;
  demandSignals: string[];
  avgDealSize: string;
  generatedAt: string;
}

type CallEvent =
  | { type: "status"; status: CallStatus }
  | { type: "transcript"; line: TranscriptLine }
  | { type: "done"; suggestedOutcome: CallOutcome; durationSec: number };

/* ────────────────────────────────────────────────
   MOCK DATA — realistic seed records
   ──────────────────────────────────────────────── */

const MOCK_LEADS: Lead[] = [
  // ── India ──
  { id: "L001", name: "Shree Ganesh Bhojnalaya", industry: "restaurant", city: "Ahmedabad", country: "India", phone: "+91 98795 41203", rating: 4.3, reviews: 812, websiteStatus: "none", score: 87, stage: "New", assignedTo: "E1", notes: "", followUpDate: "", estimatedValue: 1200 },
  { id: "L002", name: "Chai Tapri", industry: "cafe", city: "Pune", country: "India", phone: "+91 90283 77415", rating: 4.6, reviews: 1540, websiteStatus: "none", score: 91, stage: "Contacted", assignedTo: "E1", notes: "Owner Rohan very active on Instagram, no site. Wants online ordering.", followUpDate: "2026-07-14", estimatedValue: 1500 },
  { id: "L003", name: "Glamour Touch Beauty Parlour", industry: "salon", city: "Mumbai", country: "India", phone: "+91 98211 06534", rating: 4.1, reviews: 289, websiteStatus: "none", score: 74, stage: "New", assignedTo: null, notes: "", followUpDate: "", estimatedValue: 900 },
  { id: "L004", name: "Patel Construction Co.", industry: "construction", city: "Surat", country: "India", phone: "+91 99741 82960", rating: 4.5, reviews: 96, websiteStatus: "broken", score: 82, stage: "Interested", assignedTo: "E5", notes: "Site down since 2023. Bids on govt tenders — needs portfolio page.", followUpDate: "2026-07-13", estimatedValue: 2800 },
  { id: "L005", name: "FitZone Gym", industry: "gym", city: "Jaipur", country: "India", phone: "+91 94140 33827", rating: 4.4, reviews: 431, websiteStatus: "none", score: 79, stage: "New", assignedTo: "E1", notes: "", followUpDate: "", estimatedValue: 1100 },
  { id: "L006", name: "Shubham Dental Clinic", industry: "clinic", city: "New Delhi", country: "India", phone: "+91 98100 74451", rating: 4.8, reviews: 673, websiteStatus: "outdated", score: 88, stage: "Proposal Sent", assignedTo: "E5", notes: "Dr. Shubham wants online appointment booking. Proposal sent 8 Jul.", followUpDate: "2026-07-15", estimatedValue: 2400 },
  { id: "L007", name: "Kirana King Superstore", industry: "retail", city: "Bengaluru", country: "India", phone: "+91 96865 20917", rating: 4.0, reviews: 358, websiteStatus: "none", score: 65, stage: "New", assignedTo: null, notes: "", followUpDate: "", estimatedValue: 800 },
  { id: "L008", name: "Royal Punjab Dhaba", industry: "restaurant", city: "Ludhiana", country: "India", phone: "+91 98724 15586", rating: 4.2, reviews: 1102, websiteStatus: "none", score: 76, stage: "Contacted", assignedTo: "E1", notes: "Highway location, big Zomato presence but zero web identity.", followUpDate: "2026-07-16", estimatedValue: 1000 },
  // ── USA ──
  { id: "L009", name: "Rosie's Diner", industry: "restaurant", city: "Nashville", country: "USA", phone: "+1 (615) 555-0134", rating: 4.7, reviews: 2210, websiteStatus: "none", score: 93, stage: "Interested", assignedTo: "E2", notes: "Rosie's daughter handles socials. Losing catering leads without a site.", followUpDate: "2026-07-12", estimatedValue: 3500 },
  { id: "L010", name: "Bean & Barrel Coffee", industry: "cafe", city: "Austin", country: "USA", phone: "+1 (512) 555-0189", rating: 4.5, reviews: 987, websiteStatus: "broken", score: 85, stage: "Contacted", assignedTo: "E2", notes: "Squarespace lapsed, domain parked. Quick win.", followUpDate: "2026-07-13", estimatedValue: 2200 },
  { id: "L011", name: "Clippers Barbershop", industry: "salon", city: "Phoenix", country: "USA", phone: "+1 (602) 555-0121", rating: 4.6, reviews: 512, websiteStatus: "none", score: 81, stage: "New", assignedTo: "E2", notes: "", followUpDate: "", estimatedValue: 1800 },
  { id: "L012", name: "Hartley Roofing & Siding", industry: "construction", city: "Boise", country: "USA", phone: "+1 (208) 555-0166", rating: 4.9, reviews: 148, websiteStatus: "none", score: 95, stage: "Proposal Sent", assignedTo: "E8", notes: "Storm season = inbound spike. Wants lead-capture forms. Verbal yes at $4.5k.", followUpDate: "2026-07-12", estimatedValue: 4500 },
  { id: "L013", name: "Iron Peak Fitness", industry: "gym", city: "Tampa", country: "USA", phone: "+1 (813) 555-0148", rating: 4.3, reviews: 620, websiteStatus: "outdated", score: 72, stage: "New", assignedTo: null, notes: "", followUpDate: "", estimatedValue: 2000 },
  { id: "L014", name: "Maple Grove Family Dental", industry: "clinic", city: "Columbus", country: "USA", phone: "+1 (614) 555-0173", rating: 4.8, reviews: 890, websiteStatus: "outdated", score: 89, stage: "Won", assignedTo: "E8", notes: "Closed 9 Jul — $3.8k site + booking. Kickoff call Monday.", followUpDate: "2026-07-14", estimatedValue: 3800 },
  { id: "L015", name: "Thrift & Thread", industry: "retail", city: "Tucson", country: "USA", phone: "+1 (520) 555-0157", rating: 4.4, reviews: 305, websiteStatus: "none", score: 68, stage: "New", assignedTo: null, notes: "", followUpDate: "", estimatedValue: 1400 },
  // ── UK ──
  { id: "L016", name: "The Rusty Anchor Pub", industry: "restaurant", city: "Bristol", country: "UK", phone: "+44 7700 900412", rating: 4.5, reviews: 1730, websiteStatus: "none", score: 84, stage: "Contacted", assignedTo: "E4", notes: "Landlord Gary interested in Sunday-roast bookings page.", followUpDate: "2026-07-15", estimatedValue: 2600 },
  { id: "L017", name: "Brew Lane Coffee House", industry: "cafe", city: "Leeds", country: "UK", phone: "+44 7700 900268", rating: 4.7, reviews: 654, websiteStatus: "none", score: 80, stage: "New", assignedTo: "E4", notes: "", followUpDate: "", estimatedValue: 1700 },
  { id: "L018", name: "Shear Elegance Hair Studio", industry: "salon", city: "Manchester", country: "UK", phone: "+44 7700 900531", rating: 4.2, reviews: 388, websiteStatus: "broken", score: 77, stage: "New", assignedTo: null, notes: "", followUpDate: "", estimatedValue: 1500 },
  { id: "L019", name: "Caldwell Bricklaying Ltd", industry: "construction", city: "Glasgow", country: "UK", phone: "+44 7700 900694", rating: 4.6, reviews: 71, websiteStatus: "none", score: 83, stage: "Interested", assignedTo: "E4", notes: "Wants Checkatrade-independent presence. Budget ~£2k.", followUpDate: "2026-07-14", estimatedValue: 2500 },
  { id: "L020", name: "Northside Boxing Gym", industry: "gym", city: "Sheffield", country: "UK", phone: "+44 7700 900347", rating: 4.8, reviews: 542, websiteStatus: "none", score: 86, stage: "New", assignedTo: null, notes: "", followUpDate: "", estimatedValue: 1900 },
  { id: "L021", name: "Elm Street Physiotherapy", industry: "clinic", city: "Birmingham", country: "UK", phone: "+44 7700 900775", rating: 4.9, reviews: 421, websiteStatus: "outdated", score: 90, stage: "Lost", assignedTo: "E4", notes: "Went with nephew's agency. Revisit in Q4.", followUpDate: "2026-10-05", estimatedValue: 2300 },
  // ── Canada ──
  { id: "L022", name: "Poutine Bros", industry: "restaurant", city: "Ottawa", country: "Canada", phone: "+1 (613) 555-0177", rating: 4.4, reviews: 1105, websiteStatus: "none", score: 78, stage: "New", assignedTo: "E7", notes: "", followUpDate: "", estimatedValue: 2100 },
  { id: "L023", name: "Maple Bean Café", industry: "cafe", city: "Calgary", country: "Canada", phone: "+1 (403) 555-0142", rating: 4.6, reviews: 733, websiteStatus: "none", score: 82, stage: "Contacted", assignedTo: "E7", notes: "Owner Danielle asked for pricing one-pager.", followUpDate: "2026-07-13", estimatedValue: 1900 },
  { id: "L024", name: "Northern Lights Spa & Salon", industry: "salon", city: "Winnipeg", country: "Canada", phone: "+1 (204) 555-0116", rating: 4.3, reviews: 264, websiteStatus: "outdated", score: 70, stage: "New", assignedTo: null, notes: "", followUpDate: "", estimatedValue: 1600 },
  { id: "L025", name: "Lakeside Decks & Fencing", industry: "construction", city: "Halifax", country: "Canada", phone: "+1 (902) 555-0193", rating: 4.7, reviews: 88, websiteStatus: "none", score: 88, stage: "Interested", assignedTo: "E7", notes: "Summer backlog full — wants site live before fall quotes.", followUpDate: "2026-07-17", estimatedValue: 3200 },
  { id: "L026", name: "True North CrossFit", industry: "gym", city: "Edmonton", country: "Canada", phone: "+1 (780) 555-0129", rating: 4.5, reviews: 476, websiteStatus: "broken", score: 75, stage: "New", assignedTo: null, notes: "", followUpDate: "", estimatedValue: 2000 },
  // ── Australia ──
  { id: "L027", name: "Wattle Creek Bakery Café", industry: "cafe", city: "Adelaide", country: "Australia", phone: "+61 491 570 156", rating: 4.8, reviews: 892, websiteStatus: "none", score: 89, stage: "Contacted", assignedTo: "E7", notes: "Queues out the door on weekends. Wants pre-order page.", followUpDate: "2026-07-14", estimatedValue: 2400 },
  { id: "L028", name: "Bondi Fade Barbers", industry: "salon", city: "Sydney", country: "Australia", phone: "+61 491 570 313", rating: 4.6, reviews: 605, websiteStatus: "none", score: 83, stage: "New", assignedTo: null, notes: "", followUpDate: "", estimatedValue: 1800 },
  { id: "L029", name: "Harbour City Plumbing & Build", industry: "construction", city: "Newcastle", country: "Australia", phone: "+61 491 570 442", rating: 4.7, reviews: 134, websiteStatus: "broken", score: 91, stage: "Proposal Sent", assignedTo: "E5", notes: "Proposal for AUD 5k rebuild + Google Business overhaul.", followUpDate: "2026-07-12", estimatedValue: 3400 },
  { id: "L030", name: "Southern Cross Gym", industry: "gym", city: "Perth", country: "Australia", phone: "+61 491 570 588", rating: 4.2, reviews: 351, websiteStatus: "none", score: 71, stage: "New", assignedTo: null, notes: "", followUpDate: "", estimatedValue: 1700 },
  { id: "L031", name: "Coastal Physio Clinic", industry: "clinic", city: "Gold Coast", country: "Australia", phone: "+61 491 570 627", rating: 4.9, reviews: 508, websiteStatus: "none", score: 92, stage: "Interested", assignedTo: "E5", notes: "Books via phone only — 30% of calls missed. Perfect fit.", followUpDate: "2026-07-13", estimatedValue: 2900 },
  // ── UAE ──
  { id: "L032", name: "Al Safa Grill House", industry: "restaurant", city: "Dubai", country: "UAE", phone: "+971 50 555 0132", rating: 4.5, reviews: 1320, websiteStatus: "none", score: 85, stage: "Contacted", assignedTo: "E3", notes: "Manager Khalid wants menu + WhatsApp ordering integration.", followUpDate: "2026-07-15", estimatedValue: 3000 },
  { id: "L033", name: "Desert Rose Beauty Lounge", industry: "salon", city: "Abu Dhabi", country: "UAE", phone: "+971 50 555 0287", rating: 4.4, reviews: 419, websiteStatus: "outdated", score: 73, stage: "New", assignedTo: "E3", notes: "", followUpDate: "", estimatedValue: 2200 },
  { id: "L034", name: "Falcon Star Gym", industry: "gym", city: "Sharjah", country: "UAE", phone: "+971 50 555 0364", rating: 4.3, reviews: 287, websiteStatus: "none", score: 69, stage: "New", assignedTo: null, notes: "", followUpDate: "", estimatedValue: 1900 },
];

const MOCK_EMPLOYEES: Employee[] = [
  { id: "E1", name: "Priya Sharma", role: "SDR", countries: ["India"], industries: ["restaurant", "cafe", "gym"], conversionRate: 14.2, callsMade: 312 },
  { id: "E2", name: "Jake Morrison", role: "SDR", countries: ["USA"], industries: ["restaurant", "cafe", "salon"], conversionRate: 11.8, callsMade: 287 },
  { id: "E3", name: "Aisha Khan", role: "Closer", countries: ["UAE", "UK"], industries: ["restaurant", "salon", "clinic"], conversionRate: 22.5, callsMade: 164 },
  { id: "E4", name: "Tom Whitfield", role: "Closer", countries: ["UK"], industries: ["construction", "gym", "restaurant"], conversionRate: 19.7, callsMade: 143 },
  { id: "E5", name: "Meera Iyer", role: "Account Manager", countries: ["India", "Australia"], industries: ["clinic", "construction"], conversionRate: 26.1, callsMade: 98 },
  { id: "E6", name: "Daniel Okafor", role: "Researcher", countries: ["USA", "Canada"], industries: ["retail", "clinic", "construction"], conversionRate: 0, callsMade: 12 },
  { id: "E7", name: "Sophie Nguyen", role: "SDR", countries: ["Canada", "Australia"], industries: ["cafe", "gym", "retail"], conversionRate: 13.4, callsMade: 251 },
  { id: "E8", name: "Carlos Rivera", role: "Account Manager", countries: ["USA"], industries: ["construction", "clinic"], conversionRate: 24.8, callsMade: 87 },
];

const todayISO = () => new Date().toISOString();
const todayDate = () => new Date().toISOString().slice(0, 10);

const MOCK_CALLS: CallRecord[] = [
  {
    id: "C001", leadId: "L009", timestamp: `${todayDate()}T09:12:00.000Z`, durationSec: 214, outcome: "interested", agentName: "Ava (AI Agent)",
    transcript: [
      { speaker: "agent", text: "Hi, this is Ava calling on behalf of LeadCaller AI. Am I speaking with someone at Rosie's Diner?" },
      { speaker: "prospect", text: "Yeah, this is Rosie. What's this about?" },
      { speaker: "agent", text: "We noticed Rosie's Diner has a 4.7-star rating in Nashville but no website — you're likely losing catering orders to competitors who show up online." },
      { speaker: "prospect", text: "Honestly, my daughter's been telling me the same thing. What would it cost?" },
      { speaker: "agent", text: "Most diners your size start around $3,000 including online menu and catering inquiry forms. Could I book a 15-minute demo this week?" },
      { speaker: "prospect", text: "Sure, Thursday afternoon works." },
    ],
  },
  {
    id: "C002", leadId: "L023", timestamp: `${todayDate()}T10:47:00.000Z`, durationSec: 96, outcome: "callback", agentName: "Ava (AI Agent)",
    transcript: [
      { speaker: "agent", text: "Hi, this is Ava with LeadCaller AI, calling for the owner of Maple Bean Café in Calgary." },
      { speaker: "prospect", text: "Speaking, but I'm mid-rush right now." },
      { speaker: "agent", text: "Totally understand. Quick version: your café has no website and we build ones that take pre-orders. When's a better time to call?" },
      { speaker: "prospect", text: "Try me after 3pm, and send a pricing sheet first." },
    ],
  },
  {
    id: "C003", leadId: "L018", timestamp: `${todayDate()}T08:05:00.000Z`, durationSec: 0, outcome: "no_answer", agentName: "Ava (AI Agent)", transcript: [],
  },
  {
    id: "C004", leadId: "L032", timestamp: "2026-07-10T14:22:00.000Z", durationSec: 187, outcome: "interested", agentName: "Ava (AI Agent)",
    transcript: [
      { speaker: "agent", text: "Good afternoon, this is Ava calling for the manager of Al Safa Grill House in Dubai." },
      { speaker: "prospect", text: "This is Khalid, go ahead." },
      { speaker: "agent", text: "Al Safa has over 1,300 reviews but no website. We build restaurant sites with menus and WhatsApp ordering, popular across Dubai." },
      { speaker: "prospect", text: "WhatsApp ordering is exactly what we discussed internally. Send me details." },
    ],
  },
  {
    id: "C005", leadId: "L021", timestamp: "2026-07-08T11:30:00.000Z", durationSec: 142, outcome: "not_interested", agentName: "Ava (AI Agent)",
    transcript: [
      { speaker: "agent", text: "Hi, this is Ava from LeadCaller AI, calling for Elm Street Physiotherapy in Birmingham." },
      { speaker: "prospect", text: "We've just signed with another agency, sorry." },
      { speaker: "agent", text: "No problem at all — best of luck with the launch. May we check back in a few months?" },
      { speaker: "prospect", text: "That's fine. Goodbye." },
    ],
  },
];

const MOCK_INSIGHTS: InsightCard[] = [
  {
    id: "I01", industry: "restaurant", country: "Global", title: "Restaurants: discovery happens online, ordering happens offline",
    problems: ["No online menu — customers call to ask basic questions", "Dependent on aggregator apps taking 25-30% commission", "Catering/party inquiries lost to competitors with booking forms"],
    gapAnalysis: "Aggregators solve delivery but not identity. A commission-free direct site with menu + reservations has no dominant low-cost provider for single-location restaurants.",
    demandSignals: ["\"how to get restaurant off zomato commission\" +38% search YoY", "62% of surveyed owners cite aggregator fees as top cost concern"],
    avgDealSize: "$1,000 – $3,500", generatedAt: "2026-07-09T10:00:00.000Z",
  },
  {
    id: "I02", industry: "salon", country: "Global", title: "Salons: no-shows and phone-only booking bleed revenue",
    problems: ["Bookings only via phone/walk-in — missed calls = lost revenue", "No-show rate 15-20% with no deposit mechanism", "Instagram presence strong but no conversion path"],
    gapAnalysis: "Booking SaaS (Fresha, Booksy) exists but takes marketplace control. Independent salons want their OWN branded booking page — an underserved middle.",
    demandSignals: ["Booksy marketplace complaints trending in owner forums", "\"salon booking page\" searches +24% YoY"],
    avgDealSize: "$900 – $2,200", generatedAt: "2026-07-09T10:00:00.000Z",
  },
  {
    id: "I03", industry: "construction", country: "USA", title: "Contractors: highest ticket, weakest web presence",
    problems: ["Portfolio lives in a phone camera roll, not online", "Lead gen dependent on Angi/HomeAdvisor paid leads shared with 4+ competitors", "No way to capture storm-season inbound surge"],
    gapAnalysis: "Lead marketplaces resell the same lead to multiple contractors. An owned site with photo portfolio + quote form converts exclusive leads — few affordable providers target small crews.",
    demandSignals: ["Angi lead-price complaints up sharply in contractor subreddits", "Storm-season 'roofer near me' spikes 5x in affected metros"],
    avgDealSize: "$2,500 – $4,500", generatedAt: "2026-07-09T10:00:00.000Z",
  },
  {
    id: "I04", industry: "clinic", country: "Global", title: "Clinics: missed calls are missed patients",
    problems: ["Reception misses ~30% of booking calls during treatment hours", "No online appointment scheduling or reminders", "Outdated sites erode trust for a trust-critical service"],
    gapAnalysis: "Enterprise health platforms ignore 1-3 practitioner clinics. Simple booking + reminder site at small-clinic price point is wide open, especially outside the US.",
    demandSignals: ["\"online appointment booking small clinic\" +31% YoY", "Patient surveys: 68% prefer booking online over calling"],
    avgDealSize: "$2,000 – $3,800", generatedAt: "2026-07-09T10:00:00.000Z",
  },
  {
    id: "I05", industry: "cafe", country: "India", title: "Indian cafés: Instagram-first, web-absent",
    problems: ["Strong IG following but no ordering or loyalty capture", "Swiggy/Zomato commissions compress thin margins", "No pre-order for peak-hour queues"],
    gapAnalysis: "UPI-native pre-order pages barely exist for independent cafés. Combining a simple site + UPI payment link + WhatsApp catalog is a gap no big player serves at ₹ pricing.",
    demandSignals: ["UPI merchant adoption near-universal in metros", "\"café website with UPI\" long-tail searches emerging"],
    avgDealSize: "$800 – $1,500", generatedAt: "2026-07-09T10:00:00.000Z",
  },
];

/* Pool of extra insights appended by "Run Research" */
const RESEARCH_POOL: Omit<InsightCard, "id" | "generatedAt">[] = [
  {
    industry: "gym", country: "Global", title: "Gyms: trial-pass friction kills walk-in conversion",
    problems: ["No online trial-pass signup — prospects must call or visit", "Class schedules shared as WhatsApp images, not live pages", "Membership churn with no automated win-back"],
    gapAnalysis: "Mindbody targets studios at $150+/mo. Independent gyms need a one-time-cost site with schedule + trial form — an ignored price tier.",
    demandSignals: ["\"gym free trial near me\" among top local intents", "Owner forums cite Mindbody cost as #1 churn reason"],
    avgDealSize: "$1,100 – $2,000",
  },
  {
    industry: "retail", country: "Global", title: "Local retail: inventory invisible to searchers",
    problems: ["\"Do you have X in stock?\" calls dominate staff time", "No local-SEO presence vs Amazon for same-day needs", "Zero customer database for repeat marketing"],
    gapAnalysis: "Full e-commerce is overkill; a simple 'what we stock' page with click-to-call captures ready-to-buy local searchers. Nobody packages this cheaply.",
    demandSignals: ["\"near me in stock\" searches +42% YoY", "Google Business messaging adoption rising among retailers"],
    avgDealSize: "$800 – $1,600",
  },
  {
    industry: "restaurant", country: "India", title: "Indian dhabas & family restaurants: aggregator-locked",
    problems: ["30% commission on delivery apps with no customer data ownership", "Menu changes require app support tickets", "Highway/dhaba segment invisible to route-planning travelers"],
    gapAnalysis: "A ₹-priced site with self-editable menu + Google Maps optimization is unserved — agencies chase big chains, apps chase commissions.",
    demandSignals: ["ONDC push creating aggregator-alternative awareness", "\"restaurant website price india\" searches +29% YoY"],
    avgDealSize: "$700 – $1,400",
  },
  {
    industry: "construction", country: "Australia", title: "AU tradies: licensed, booked out, and unfindable",
    problems: ["Reliance on hipages leads shared with competitors", "No proof-of-license display online deters cautious homeowners", "Quote requests via SMS get lost"],
    gapAnalysis: "License-badge-forward portfolio sites with structured quote forms are rare below AUD 5k. Strong wedge for a productized offering.",
    demandSignals: ["hipages fee increases widely discussed in trade groups", "\"licensed builder [suburb]\" searches growing"],
    avgDealSize: "$2,200 – $3,600",
  },
  {
    industry: "salon", country: "UAE", title: "UAE beauty lounges: premium clients expect online booking",
    problems: ["High-income clientele expects app-level booking experience", "WhatsApp-only booking creates double-booking errors", "No English/Arabic bilingual presence"],
    gapAnalysis: "Bilingual booking sites with prepayment (reducing no-shows) are almost exclusively custom-built at high cost. Productized version has clear room.",
    demandSignals: ["Dubai salon density among world's highest — differentiation pressure", "Prepaid-booking adoption rising in premium services"],
    avgDealSize: "$1,800 – $3,000",
  },
  {
    industry: "clinic", country: "UK", title: "UK private clinics: NHS overflow is a website-shaped opportunity",
    problems: ["NHS wait times push patients to private search, but small clinics don't rank", "No transparent pricing pages — patients bounce", "GDPR fears block adopting random form builders"],
    gapAnalysis: "GDPR-compliant booking + pricing transparency template for physio/dental/private GP is a defined, buyable product nobody markets to sub-5-staff clinics.",
    demandSignals: ["\"private physio near me\" +47% since 2024", "NHS backlog coverage sustaining private-care search demand"],
    avgDealSize: "$2,000 – $3,200",
  },
  {
    industry: "cafe", country: "Australia", title: "AU cafés: weekend queues, zero pre-order capture",
    problems: ["30+ minute weekend queues with no skip-the-line option", "Menu on chalkboard only — tourists can't discover", "No merch/beans e-commerce despite brand loyalty"],
    gapAnalysis: "Square sites are generic; a café-specific pre-order + beans-subscription template at fixed price is an open niche.",
    demandSignals: ["\"order ahead coffee [city]\" searches climbing", "Specialty coffee subscription market growing 11% YoY"],
    avgDealSize: "$1,500 – $2,600",
  },
  {
    industry: "gym", country: "India", title: "Indian gyms: memberships sold on paper in a UPI country",
    problems: ["Member records in registers/Excel — renewals slip through", "No online joining for the Jan/monsoon signup spikes", "Trainer schedules communicated via WhatsApp chaos"],
    gapAnalysis: "A site with UPI membership payment + renewal reminders at one-time ₹ pricing beats SaaS subscriptions culturally. Unaddressed by global players.",
    demandSignals: ["Fitness club market in India growing ~12% annually", "UPI autopay adoption enabling subscription collection"],
    avgDealSize: "$900 – $1,600",
  },
];

/* ────────────────────────────────────────────────
   SERVICE LAYER — swap these with real API calls
   ────────────────────────────────────────────────
   Every function simulates network latency and returns
   copies of mock data. Replace internals with fetch()
   against your backend; signatures can stay the same.  */

const delay = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

/** SERVICE: GET /api/leads */
async function fetchLeads(): Promise<Lead[]> {
  await delay(400);
  return MOCK_LEADS.map((l) => ({ ...l }));
}

/** SERVICE: GET /api/employees */
async function fetchEmployees(): Promise<Employee[]> {
  await delay(300);
  return MOCK_EMPLOYEES.map((e) => ({ ...e }));
}

/** SERVICE: GET /api/calls */
async function fetchCallHistory(): Promise<CallRecord[]> {
  await delay(350);
  return MOCK_CALLS.map((c) => ({ ...c, transcript: [...c.transcript] }));
}

/** SERVICE: GET /api/insights */
async function fetchInsights(): Promise<InsightCard[]> {
  await delay(300);
  return MOCK_INSIGHTS.map((i) => ({ ...i }));
}

/** SERVICE: PATCH /api/leads/:id — persist any lead field change */
async function updateLeadRemote(lead: Lead): Promise<Lead> {
  await delay(120);
  return { ...lead };
}

/** SERVICE: POST /api/calls — persist a completed call record */
async function saveCallRecord(record: CallRecord): Promise<CallRecord> {
  await delay(150);
  return { ...record };
}

/**
 * SERVICE: POST /api/research/run — simulate a crawler job.
 * Replace with a real crawl/enrichment pipeline trigger; poll or
 * stream results back. Returns newly discovered insight cards.
 */
async function runIndustryResearch(
  industry: Industry | "all",
  country: Country | "all",
): Promise<InsightCard[]> {
  await delay(2200);
  const pool = RESEARCH_POOL.filter(
    (p) =>
      (industry === "all" || p.industry === industry) &&
      (country === "all" || p.country === country || p.country === "Global"),
  );
  const source = pool.length > 0 ? pool : RESEARCH_POOL;
  const picked = [...source].sort(() => Math.random() - 0.5).slice(0, 2);
  return picked.map((p, i) => ({
    ...p,
    id: `IR${Date.now()}-${i}`,
    generatedAt: todayISO(),
  }));
}

/**
 * SERVICE: POST /api/voice/call — initiate an AI voice-agent call.
 * Replace with a real telephony/voice-AI provider (Twilio, Vapi,
 * Retell...) that streams status + transcript over a websocket.
 * Emits events via onEvent; returns a cancel function.
 */
function initiateCall(
  lead: Lead,
  script: string,
  onEvent: (e: CallEvent) => void,
): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

  const opener = renderScript(script, lead).split("\n").filter(Boolean)[0] ??
    `Hi, this is Ava calling on behalf of LeadCaller AI for ${lead.name}.`;

  const scenarios: { outcome: CallOutcome; weight: number; lines: TranscriptLine[] }[] = [
    {
      outcome: "interested", weight: 4,
      lines: [
        { speaker: "agent", text: opener },
        { speaker: "prospect", text: "Yes, you've reached us. What is this regarding?" },
        { speaker: "agent", text: `We help ${lead.industry} businesses in ${lead.city} that don't have a website. ${lead.name} has a ${lead.rating.toFixed(1)}-star rating but customers searching online can't find you.` },
        { speaker: "prospect", text: "We've been meaning to sort that out for a while, honestly." },
        { speaker: "agent", text: "That's exactly why I'm calling. We build affordable sites with booking and enquiry forms, usually live within two weeks. Would a short demo this week be useful?" },
        { speaker: "prospect", text: "Yes, that could work. Send over the details and a time." },
        { speaker: "agent", text: "Wonderful — I'll have our team follow up today with a demo slot. Thanks for your time!" },
      ],
    },
    {
      outcome: "callback", weight: 3,
      lines: [
        { speaker: "agent", text: opener },
        { speaker: "prospect", text: "Speaking, but this is a really busy time for us." },
        { speaker: "agent", text: `Understood — thirty-second version: ${lead.name} has no working website and we fix that affordably for ${lead.industry} businesses in ${lead.city}.` },
        { speaker: "prospect", text: "It's something we'd consider, but call me back another day." },
        { speaker: "agent", text: "Of course. When is generally a good time to reach you?" },
        { speaker: "prospect", text: "Weekday mornings before the rush, around nine." },
        { speaker: "agent", text: "Noted — we'll call back then. Have a great day!" },
      ],
    },
    {
      outcome: "not_interested", weight: 2,
      lines: [
        { speaker: "agent", text: opener },
        { speaker: "prospect", text: "Yes, what do you want?" },
        { speaker: "agent", text: `We noticed ${lead.name} doesn't have a website and we build them for local ${lead.industry} businesses.` },
        { speaker: "prospect", text: "We get all our business through word of mouth. Not interested." },
        { speaker: "agent", text: "Fair enough — if that ever changes, we're easy to find. Thanks for your time." },
        { speaker: "prospect", text: "Alright, bye." },
      ],
    },
  ];

  const noAnswer = Math.random() < 0.15;
  onEvent({ type: "status", status: "dialing" });

  if (noAnswer) {
    at(2600, () => {
      onEvent({ type: "status", status: "no_answer" });
      onEvent({ type: "done", suggestedOutcome: "no_answer", durationSec: 0 });
    });
    return () => timers.forEach(clearTimeout);
  }

  const totalWeight = scenarios.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * totalWeight;
  const scenario = scenarios.find((s) => (r -= s.weight) < 0) ?? scenarios[0];

  at(1800, () => onEvent({ type: "status", status: "connected" }));
  scenario.lines.forEach((line, i) => {
    at(2600 + i * 1500, () => onEvent({ type: "transcript", line }));
  });
  const endMs = 2600 + scenario.lines.length * 1500 + 600;
  at(endMs, () => {
    onEvent({ type: "status", status: "completed" });
    onEvent({
      type: "done",
      suggestedOutcome: scenario.outcome,
      durationSec: Math.round(endMs / 1000) + Math.floor(Math.random() * 60) + 40,
    });
  });

  return () => timers.forEach(clearTimeout);
}

/* ────────────────────────────────────────────────
   UTILITIES
   ──────────────────────────────────────────────── */

const INDUSTRIES: Industry[] = ["restaurant", "cafe", "salon", "construction", "gym", "clinic", "retail"];
const COUNTRIES: Country[] = ["India", "USA", "UK", "Canada", "Australia", "UAE"];
const STAGES: PipelineStage[] = ["New", "Contacted", "Interested", "Proposal Sent", "Won", "Lost"];

const COUNTRY_FLAG: Record<Country, string> = {
  India: "🇮🇳", USA: "🇺🇸", UK: "🇬🇧", Canada: "🇨🇦", Australia: "🇦🇺", UAE: "🇦🇪",
};

const INDUSTRY_ICON: Record<Industry, string> = {
  restaurant: "🍽️", cafe: "☕", salon: "💈", construction: "🏗️", gym: "🏋️", clinic: "🩺", retail: "🛍️",
};

const DEFAULT_SCRIPT = `Hi, this is {agent_name} calling on behalf of LeadCaller AI. Am I speaking with the owner of {business_name}?

I'm reaching out because {business_name} has a great reputation as a {industry} in {city} — {rating} stars on Google — but we noticed you don't have a working website. That means customers searching online right now can't find your menu, prices, or a way to book.

We build affordable, professional websites specifically for {industry} businesses, usually live within two weeks, with booking and enquiry forms included.

Would you be open to a quick 15-minute demo this week to see what {business_name}'s website could look like?`;

function renderScript(template: string, lead: Lead): string {
  return template
    .replaceAll("{business_name}", lead.name)
    .replaceAll("{industry}", lead.industry)
    .replaceAll("{city}", lead.city)
    .replaceAll("{country}", lead.country)
    .replaceAll("{rating}", lead.rating.toFixed(1))
    .replaceAll("{agent_name}", "Ava");
}

const fmtMoney = (n: number) =>
  "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

const fmtDuration = (sec: number) => {
  if (sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
};

const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const OUTCOME_META: Record<CallOutcome, { label: string; cls: string }> = {
  interested: { label: "Interested", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  callback: { label: "Callback", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  not_interested: { label: "Not interested", cls: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
  no_answer: { label: "No answer", cls: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
};

const WEBSITE_META: Record<WebsiteStatus, { label: string; cls: string }> = {
  none: { label: "No website", cls: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
  broken: { label: "Broken", cls: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  outdated: { label: "Outdated", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
};

const STAGE_COLORS: Record<PipelineStage, string> = {
  New: "border-sky-500/40 text-sky-400",
  Contacted: "border-indigo-500/40 text-indigo-400",
  Interested: "border-emerald-500/40 text-emerald-400",
  "Proposal Sent": "border-violet-500/40 text-violet-400",
  Won: "border-green-500/40 text-green-400",
  Lost: "border-rose-500/40 text-rose-400",
};

function scoreColor(score: number) {
  if (score >= 85) return "text-emerald-400";
  if (score >= 70) return "text-amber-400";
  return "text-slate-400";
}

/* ────────────────────────────────────────────────
   SMALL UI PRIMITIVES
   ──────────────────────────────────────────────── */

function Badge({ text, cls }: { text: string; cls: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${cls}`}>
      {text}
    </span>
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accent}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>
    </div>
  );
}

function Select({
  value, onChange, options, allLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allLabel?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-500"
    >
      {allLabel !== undefined && <option value="all">{allLabel}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

/* ────────────────────────────────────────────────
   MODULE 1 — LEAD DISCOVERY
   ──────────────────────────────────────────────── */

function LeadDiscovery({
  leads, employees, onCall, onAssign,
}: {
  leads: Lead[];
  employees: Employee[];
  onCall: (lead: Lead) => void;
  onAssign: (leadId: string, employeeId: string | null) => void;
}) {
  const [industry, setIndustry] = useState<string>("all");
  const [country, setCountry] = useState<string>("all");
  const [city, setCity] = useState<string>("all");
  const [website, setWebsite] = useState<string>("all");
  const [minScore, setMinScore] = useState(0);
  const [maxScore, setMaxScore] = useState(100);
  const [grouped, setGrouped] = useState(false);
  const [search, setSearch] = useState("");

  const cities = useMemo(() => {
    const pool = country === "all" ? leads : leads.filter((l) => l.country === country);
    return [...new Set(pool.map((l) => l.city))].sort();
  }, [leads, country]);

  const filtered = useMemo(
    () =>
      leads.filter(
        (l) =>
          (industry === "all" || l.industry === industry) &&
          (country === "all" || l.country === country) &&
          (city === "all" || l.city === city) &&
          (website === "all" || l.websiteStatus === website) &&
          l.score >= minScore &&
          l.score <= maxScore &&
          (search === "" || l.name.toLowerCase().includes(search.toLowerCase())),
      ),
    [leads, industry, country, city, website, minScore, maxScore, search],
  );

  const byCountry = useMemo(() => {
    const map = new Map<Country, Lead[]>();
    for (const c of COUNTRIES) map.set(c, []);
    for (const l of filtered) map.get(l.country)!.push(l);
    return [...map.entries()].filter(([, v]) => v.length > 0);
  }, [filtered]);

  const row = (l: Lead) => (
    <tr key={l.id} className="border-b border-slate-800/70 hover:bg-slate-800/30">
      <td className="px-3 py-2.5">
        <div className="font-medium text-slate-200">{l.name}</div>
        <div className="text-[11px] text-slate-500">{l.phone}</div>
      </td>
      <td className="px-3 py-2.5 text-slate-300">
        <span className="mr-1.5">{INDUSTRY_ICON[l.industry]}</span>{cap(l.industry)}
      </td>
      <td className="px-3 py-2.5 text-slate-300">
        <span className="mr-1.5">{COUNTRY_FLAG[l.country]}</span>{l.city}
      </td>
      <td className="px-3 py-2.5">
        <span className="text-amber-400">★</span>{" "}
        <span className="text-slate-200">{l.rating.toFixed(1)}</span>{" "}
        <span className="text-[11px] text-slate-500">({l.reviews})</span>
      </td>
      <td className="px-3 py-2.5">
        <Badge text={WEBSITE_META[l.websiteStatus].label} cls={WEBSITE_META[l.websiteStatus].cls} />
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full rounded-full ${l.score >= 85 ? "bg-emerald-500" : l.score >= 70 ? "bg-amber-500" : "bg-slate-500"}`}
              style={{ width: `${l.score}%` }}
            />
          </div>
          <span className={`text-xs font-semibold ${scoreColor(l.score)}`}>{l.score}</span>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <Badge text={l.stage} cls={`bg-slate-800/60 ${STAGE_COLORS[l.stage]}`} />
      </td>
      <td className="px-3 py-2.5">
        <select
          value={l.assignedTo ?? ""}
          onChange={(e) => onAssign(l.id, e.target.value || null)}
          className="w-32 rounded-md border border-slate-700 bg-slate-900 px-1.5 py-1 text-[11px] text-slate-300 outline-none focus:border-sky-500"
        >
          <option value="">Unassigned</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2.5">
        <button
          onClick={() => onCall(l)}
          className="rounded-md bg-sky-600 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-sky-500"
        >
          📞 Call
        </button>
      </td>
    </tr>
  );

  const tableHead = (
    <thead>
      <tr className="border-b border-slate-800 text-left text-[11px] uppercase tracking-wider text-slate-500">
        <th className="px-3 py-2 font-medium">Business</th>
        <th className="px-3 py-2 font-medium">Industry</th>
        <th className="px-3 py-2 font-medium">Location</th>
        <th className="px-3 py-2 font-medium">Rating</th>
        <th className="px-3 py-2 font-medium">Website</th>
        <th className="px-3 py-2 font-medium">Score</th>
        <th className="px-3 py-2 font-medium">Stage</th>
        <th className="px-3 py-2 font-medium">Assignee</th>
        <th className="px-3 py-2 font-medium">Action</th>
      </tr>
    </thead>
  );

  return (
    <div>
      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search business…"
          className="w-48 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-sky-500"
        />
        <Select value={industry} onChange={setIndustry} allLabel="All industries"
          options={INDUSTRIES.map((i) => ({ value: i, label: cap(i) }))} />
        <Select value={country} onChange={(v) => { setCountry(v); setCity("all"); }} allLabel="All countries"
          options={COUNTRIES.map((c) => ({ value: c, label: c }))} />
        <Select value={city} onChange={setCity} allLabel="All cities"
          options={cities.map((c) => ({ value: c, label: c }))} />
        <Select value={website} onChange={setWebsite} allLabel="Any website status"
          options={[
            { value: "none", label: "No website" },
            { value: "broken", label: "Broken" },
            { value: "outdated", label: "Outdated" },
          ]} />
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span>Score</span>
          <input type="number" min={0} max={100} value={minScore}
            onChange={(e) => setMinScore(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
            className="w-14 rounded-md border border-slate-700 bg-slate-900 px-1.5 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-500" />
          <span>–</span>
          <input type="number" min={0} max={100} value={maxScore}
            onChange={(e) => setMaxScore(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
            className="w-14 rounded-md border border-slate-700 bg-slate-900 px-1.5 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-500" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-500">{filtered.length} leads</span>
          <button
            onClick={() => setGrouped((g) => !g)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
              grouped
                ? "border-sky-500 bg-sky-500/15 text-sky-400"
                : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
            }`}
          >
            {grouped ? "◫ Flat view" : "🌍 Group by country"}
          </button>
        </div>
      </div>

      {/* Table / grouped view */}
      {!grouped ? (
        <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/40">
          <table className="w-full min-w-[900px] text-xs">
            {tableHead}
            <tbody>{filtered.map(row)}</tbody>
          </table>
          {filtered.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-slate-500">No leads match these filters.</div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {byCountry.map(([c, ls]) => (
            <div key={c} className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/40">
              <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 py-2.5">
                <div className="text-sm font-semibold text-slate-200">
                  {COUNTRY_FLAG[c]} {c}
                </div>
                <div className="flex items-center gap-3 text-[11px] text-slate-500">
                  <span>{ls.length} lead{ls.length !== 1 ? "s" : ""}</span>
                  <span>
                    avg score{" "}
                    <span className="font-semibold text-slate-300">
                      {Math.round(ls.reduce((s, l) => s + l.score, 0) / ls.length)}
                    </span>
                  </span>
                  <span>
                    opportunity{" "}
                    <span className="font-semibold text-emerald-400">
                      {fmtMoney(ls.reduce((s, l) => s + l.estimatedValue, 0))}
                    </span>
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-xs">
                  {tableHead}
                  <tbody>{ls.map(row)}</tbody>
                </table>
              </div>
            </div>
          ))}
          {byCountry.length === 0 && (
            <div className="rounded-lg border border-slate-800 px-4 py-10 text-center text-sm text-slate-500">
              No leads match these filters.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────
   MODULE 2 — VOICE AGENT (call panel, script editor, history)
   ──────────────────────────────────────────────── */

function CallPanel({
  lead, script, onClose, onComplete,
}: {
  lead: Lead;
  script: string;
  onClose: () => void;
  onComplete: (outcome: CallOutcome, transcript: TranscriptLine[], durationSec: number) => void;
}) {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [suggested, setSuggested] = useState<CallOutcome | null>(null);
  const [duration, setDuration] = useState(0);
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [saved, setSaved] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const startCall = () => {
    cancelRef.current?.();
    setStatus("dialing");
    setTranscript([]);
    setSuggested(null);
    setOutcome(null);
    setSaved(false);
    cancelRef.current = initiateCall(lead, script, (e) => {
      if (e.type === "status") setStatus(e.status);
      else if (e.type === "transcript") setTranscript((t) => [...t, e.line]);
      else {
        setSuggested(e.suggestedOutcome);
        setOutcome(e.suggestedOutcome);
        setDuration(e.durationSec);
      }
    });
  };

  useEffect(() => () => cancelRef.current?.(), []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript]);

  const callEnded = status === "completed" || status === "no_answer";

  const statusMeta: Record<CallStatus, { label: string; cls: string; pulse?: boolean }> = {
    idle: { label: "Ready to dial", cls: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
    dialing: { label: "Dialing…", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30", pulse: true },
    connected: { label: "● Connected — live", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", pulse: true },
    completed: { label: "Call ended", cls: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
    no_answer: { label: "No answer", cls: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <div className="text-base font-semibold text-slate-100">
              {INDUSTRY_ICON[lead.industry]} {lead.name}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              {COUNTRY_FLAG[lead.country]} {lead.city}, {lead.country} · {lead.phone} · ★ {lead.rating.toFixed(1)}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusMeta[status].cls} ${statusMeta[status].pulse ? "animate-pulse" : ""}`}>
              {statusMeta[status].label}
            </span>
            <button onClick={onClose} className="text-lg leading-none text-slate-500 hover:text-slate-300">✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4" ref={scrollRef}>
          {status === "idle" && (
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Agent script preview (variables resolved)
              </div>
              <div className="whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950/60 p-4 text-xs leading-relaxed text-slate-300">
                {renderScript(script, lead)}
              </div>
            </div>
          )}

          {status === "dialing" && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <div className="mb-3 animate-bounce text-4xl">📞</div>
              <div className="text-sm">Calling {lead.phone}…</div>
            </div>
          )}

          {status === "no_answer" && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <div className="mb-3 text-4xl">📵</div>
              <div className="text-sm">No answer at {lead.phone}.</div>
              <div className="mt-1 text-xs text-slate-500">Logged as a no-answer attempt — try again later.</div>
            </div>
          )}

          {(status === "connected" || (status === "completed" && transcript.length > 0)) && (
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Live transcript
              </div>
              <div className="space-y-2.5">
                {transcript.map((line, i) => (
                  <div key={i} className={`flex ${line.speaker === "agent" ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[80%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                      line.speaker === "agent"
                        ? "border border-sky-500/20 bg-sky-500/10 text-sky-100"
                        : "border border-slate-700 bg-slate-800 text-slate-200"
                    }`}>
                      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-60">
                        {line.speaker === "agent" ? "Ava · AI Agent" : "Prospect"}
                      </div>
                      {line.text}
                    </div>
                  </div>
                ))}
                {status === "connected" && (
                  <div className="flex justify-start">
                    <div className="animate-pulse rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-500">
                      …
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-800 px-5 py-4">
          {status === "idle" && (
            <button
              onClick={startCall}
              className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              📞 Start AI Call
            </button>
          )}
          {(status === "dialing" || status === "connected") && (
            <button
              onClick={() => {
                cancelRef.current?.();
                setStatus("completed");
                setSuggested("callback");
                setOutcome("callback");
                setDuration(Math.max(transcript.length * 8, 5));
              }}
              className="w-full rounded-lg bg-rose-600 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500"
            >
              ⏹ End Call
            </button>
          )}
          {callEnded && !saved && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Tag outcome{" "}
                  {suggested && <span className="normal-case text-slate-600">(AI suggests: {OUTCOME_META[suggested].label})</span>}
                </span>
                <span className="text-[11px] text-slate-500">Duration: {fmtDuration(duration)}</span>
              </div>
              <div className="mb-3 grid grid-cols-4 gap-2">
                {(Object.keys(OUTCOME_META) as CallOutcome[]).map((o) => (
                  <button
                    key={o}
                    onClick={() => setOutcome(o)}
                    className={`rounded-md border px-2 py-2 text-[11px] font-medium transition ${
                      outcome === o
                        ? OUTCOME_META[o].cls + " ring-1 ring-current"
                        : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500"
                    }`}
                  >
                    {OUTCOME_META[o].label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (outcome) {
                      onComplete(outcome, transcript, duration);
                      setSaved(true);
                    }
                  }}
                  disabled={!outcome}
                  className="flex-1 rounded-lg bg-sky-600 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-40"
                >
                  Save outcome & log call
                </button>
                <button
                  onClick={startCall}
                  className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:border-slate-500"
                >
                  ↻ Redial
                </button>
              </div>
            </div>
          )}
          {saved && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-emerald-400">
                ✓ Call logged{outcome ? ` as “${OUTCOME_META[outcome].label}”` : ""} — pipeline updated.
              </span>
              <button
                onClick={onClose}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-500"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function VoiceAgent({
  leads, calls, script, onScriptChange, onCall,
}: {
  leads: Lead[];
  calls: CallRecord[];
  script: string;
  onScriptChange: (s: string) => void;
  onCall: (lead: Lead) => void;
}) {
  const [previewLeadId, setPreviewLeadId] = useState(leads[0]?.id ?? "");
  const [expandedCall, setExpandedCall] = useState<string | null>(null);
  const previewLead = leads.find((l) => l.id === previewLeadId) ?? leads[0];

  const sortedCalls = useMemo(
    () => [...calls].sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [calls],
  );

  const leadName = (id: string) => leads.find((l) => l.id === id)?.name ?? id;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* Script editor */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">AI Call Script Template</h3>
          <button
            onClick={() => onScriptChange(DEFAULT_SCRIPT)}
            className="text-[11px] text-slate-500 hover:text-slate-300"
          >
            ↺ Reset to default
          </button>
        </div>
        <textarea
          value={script}
          onChange={(e) => onScriptChange(e.target.value)}
          rows={14}
          className="w-full rounded-lg border border-slate-700 bg-slate-950/60 p-3 font-mono text-xs leading-relaxed text-slate-200 outline-none focus:border-sky-500"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {["{business_name}", "{industry}", "{city}", "{country}", "{rating}", "{agent_name}"].map((v) => (
            <button
              key={v}
              onClick={() => onScriptChange(script + (script.endsWith(" ") || script === "" ? "" : " ") + v)}
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-[10px] text-sky-400 transition hover:border-sky-500"
              title="Append variable to script"
            >
              {v}
            </button>
          ))}
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">Preview with lead</h3>
            <div className="flex items-center gap-2">
              <Select
                value={previewLeadId}
                onChange={setPreviewLeadId}
                options={leads.map((l) => ({ value: l.id, label: `${l.name} (${l.city})` }))}
              />
              {previewLead && (
                <button
                  onClick={() => onCall(previewLead)}
                  className="rounded-md bg-sky-600 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-sky-500"
                >
                  📞 Call this lead
                </button>
              )}
            </div>
          </div>
          {previewLead && (
            <div className="whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950/60 p-4 text-xs leading-relaxed text-slate-300">
              {renderScript(script, previewLead)}
            </div>
          )}
        </div>
      </div>

      {/* Call history */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-200">
          Call History <span className="ml-1 text-xs font-normal text-slate-500">({sortedCalls.length} calls)</span>
        </h3>
        <div className="space-y-2">
          {sortedCalls.map((c) => (
            <div key={c.id} className="rounded-lg border border-slate-800 bg-slate-900/50">
              <button
                onClick={() => setExpandedCall(expandedCall === c.id ? null : c.id)}
                className="flex w-full items-center justify-between px-3.5 py-2.5 text-left"
              >
                <div>
                  <div className="text-xs font-medium text-slate-200">{leadName(c.leadId)}</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    {fmtDateTime(c.timestamp)} · {fmtDuration(c.durationSec)} · {c.agentName}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge text={OUTCOME_META[c.outcome].label} cls={OUTCOME_META[c.outcome].cls} />
                  <span className="text-slate-600">{expandedCall === c.id ? "▾" : "▸"}</span>
                </div>
              </button>
              {expandedCall === c.id && (
                <div className="border-t border-slate-800 px-3.5 py-3">
                  {c.transcript.length === 0 ? (
                    <div className="text-[11px] text-slate-500">No transcript — call was not answered.</div>
                  ) : (
                    <div className="space-y-1.5">
                      {c.transcript.map((line, i) => (
                        <div key={i} className="text-[11px] leading-relaxed">
                          <span className={`font-semibold ${line.speaker === "agent" ? "text-sky-400" : "text-slate-400"}`}>
                            {line.speaker === "agent" ? "Ava:" : "Prospect:"}
                          </span>{" "}
                          <span className="text-slate-300">{line.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {sortedCalls.length === 0 && (
            <div className="rounded-lg border border-slate-800 px-4 py-8 text-center text-sm text-slate-500">
              No calls yet — hit a Call button in Lead Discovery.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────
   MODULE 3 — CRM PIPELINE (kanban)
   ──────────────────────────────────────────────── */

function Pipeline({
  leads, employees, onStageChange, onUpdateLead, onCall,
}: {
  leads: Lead[];
  employees: Employee[];
  onStageChange: (leadId: string, stage: PipelineStage) => void;
  onUpdateLead: (leadId: string, patch: Partial<Lead>) => void;
  onCall: (lead: Lead) => void;
}) {
  const [dragOver, setDragOver] = useState<PipelineStage | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const empName = (id: string | null) =>
    id ? employees.find((e) => e.id === id)?.name ?? "—" : "Unassigned";

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-[1200px] gap-3">
        {STAGES.map((stage) => {
          const stageLeads = leads.filter((l) => l.stage === stage);
          const value = stageLeads.reduce((s, l) => s + l.estimatedValue, 0);
          return (
            <div
              key={stage}
              onDragOver={(e) => { e.preventDefault(); setDragOver(stage); }}
              onDragLeave={() => setDragOver((d) => (d === stage ? null : d))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const id = e.dataTransfer.getData("text/plain");
                if (id) onStageChange(id, stage);
              }}
              className={`flex w-[200px] flex-shrink-0 flex-col rounded-lg border bg-slate-900/40 transition ${
                dragOver === stage ? "border-sky-500 bg-sky-500/5" : "border-slate-800"
              }`}
            >
              <div className="border-b border-slate-800 px-3 py-2.5">
                <div className={`text-xs font-semibold ${STAGE_COLORS[stage].split(" ")[1]}`}>{stage}</div>
                <div className="mt-0.5 flex items-center justify-between text-[10px] text-slate-500">
                  <span>{stageLeads.length} lead{stageLeads.length !== 1 ? "s" : ""}</span>
                  <span>{fmtMoney(value)}</span>
                </div>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-2" style={{ maxHeight: "calc(100vh - 320px)", minHeight: 120 }}>
                {stageLeads.map((l) => (
                  <div
                    key={l.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", l.id)}
                    className="cursor-grab rounded-md border border-slate-700/70 bg-slate-900 p-2.5 shadow-sm transition hover:border-slate-500 active:cursor-grabbing"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="text-xs font-medium leading-snug text-slate-200">
                        {INDUSTRY_ICON[l.industry]} {l.name}
                      </div>
                      <span className={`text-[10px] font-bold ${scoreColor(l.score)}`}>{l.score}</span>
                    </div>
                    <div className="mt-1 text-[10px] text-slate-500">
                      {COUNTRY_FLAG[l.country]} {l.city} · {fmtMoney(l.estimatedValue)}
                    </div>
                    <div className="mt-1 text-[10px] text-slate-500">👤 {empName(l.assignedTo)}</div>
                    {l.followUpDate && (
                      <div className={`mt-1 text-[10px] ${l.followUpDate <= todayDate() ? "text-rose-400" : "text-amber-400/80"}`}>
                        ⏰ Follow-up {l.followUpDate}{l.followUpDate <= todayDate() ? " (due)" : ""}
                      </div>
                    )}
                    {l.notes && expanded !== l.id && (
                      <div className="mt-1 truncate text-[10px] italic text-slate-600">📝 {l.notes}</div>
                    )}
                    <div className="mt-2 flex gap-1.5">
                      <button
                        onClick={() => setExpanded(expanded === l.id ? null : l.id)}
                        className="flex-1 rounded border border-slate-700 px-1.5 py-1 text-[10px] text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
                      >
                        {expanded === l.id ? "Close" : "Edit"}
                      </button>
                      <button
                        onClick={() => onCall(l)}
                        className="flex-1 rounded bg-sky-600/90 px-1.5 py-1 text-[10px] font-semibold text-white transition hover:bg-sky-500"
                      >
                        📞 Call
                      </button>
                    </div>
                    {expanded === l.id && (
                      <div className="mt-2 space-y-2 border-t border-slate-800 pt-2">
                        <div>
                          <label className="mb-1 block text-[10px] font-medium text-slate-500">Notes</label>
                          <textarea
                            value={l.notes}
                            onChange={(e) => onUpdateLead(l.id, { notes: e.target.value })}
                            rows={3}
                            placeholder="Add a note…"
                            className="w-full rounded border border-slate-700 bg-slate-950 p-1.5 text-[11px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-sky-500"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-medium text-slate-500">Next follow-up</label>
                          <input
                            type="date"
                            value={l.followUpDate}
                            onChange={(e) => onUpdateLead(l.id, { followUpDate: e.target.value })}
                            className="w-full rounded border border-slate-700 bg-slate-950 p-1.5 text-[11px] text-slate-200 outline-none focus:border-sky-500"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-medium text-slate-500">Assignee</label>
                          <select
                            value={l.assignedTo ?? ""}
                            onChange={(e) => onUpdateLead(l.id, { assignedTo: e.target.value || null })}
                            className="w-full rounded border border-slate-700 bg-slate-950 p-1.5 text-[11px] text-slate-200 outline-none focus:border-sky-500"
                          >
                            <option value="">Unassigned</option>
                            {employees.map((e) => (
                              <option key={e.id} value={e.id}>{e.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {stageLeads.length === 0 && (
                  <div className="rounded-md border border-dashed border-slate-800 px-2 py-6 text-center text-[10px] text-slate-600">
                    Drop leads here
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────
   MODULE 4 — TEAM
   ──────────────────────────────────────────────── */

function Team({
  employees, leads, calls, onAssign,
}: {
  employees: Employee[];
  leads: Lead[];
  calls: CallRecord[];
  onAssign: (leadId: string, employeeId: string | null) => void;
}) {
  const [selectedEmp, setSelectedEmp] = useState<string | null>(null);

  const assignedLeads = (empId: string) => leads.filter((l) => l.assignedTo === empId);
  const unassigned = leads.filter((l) => !l.assignedTo);

  const roleCls: Record<Employee["role"], string> = {
    SDR: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    Closer: "bg-violet-500/15 text-violet-400 border-violet-500/30",
    "Account Manager": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    Researcher: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  };

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {/* Employee cards */}
      <div className="lg:col-span-2">
        <h3 className="mb-3 text-sm font-semibold text-slate-200">Team ({employees.length})</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {employees.map((e) => {
            const mine = assignedLeads(e.id);
            const pipelineVal = mine.reduce((s, l) => s + l.estimatedValue, 0);
            const won = mine.filter((l) => l.stage === "Won").length;
            return (
              <div
                key={e.id}
                className={`cursor-pointer rounded-lg border p-4 transition ${
                  selectedEmp === e.id ? "border-sky-500 bg-sky-500/5" : "border-slate-800 bg-slate-900/50 hover:border-slate-600"
                }`}
                onClick={() => setSelectedEmp(selectedEmp === e.id ? null : e.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-xs font-bold text-slate-200">
                      {e.name.split(" ").map((p) => p[0]).join("")}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-200">{e.name}</div>
                      <Badge text={e.role} cls={roleCls[e.role]} />
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-emerald-400">{e.conversionRate.toFixed(1)}%</div>
                    <div className="text-[10px] text-slate-500">conversion</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded bg-slate-800/60 py-1.5">
                    <div className="text-sm font-semibold text-slate-200">{mine.length}</div>
                    <div className="text-[10px] text-slate-500">leads</div>
                  </div>
                  <div className="rounded bg-slate-800/60 py-1.5">
                    <div className="text-sm font-semibold text-slate-200">{e.callsMade}</div>
                    <div className="text-[10px] text-slate-500">calls made</div>
                  </div>
                  <div className="rounded bg-slate-800/60 py-1.5">
                    <div className="text-sm font-semibold text-emerald-400">{fmtMoney(pipelineVal)}</div>
                    <div className="text-[10px] text-slate-500">pipeline</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {e.countries.map((c) => (
                    <span key={c} className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                      {COUNTRY_FLAG[c]} {c}
                    </span>
                  ))}
                  {e.industries.map((i) => (
                    <span key={i} className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-500">
                      {INDUSTRY_ICON[i]} {cap(i)}
                    </span>
                  ))}
                </div>
                {selectedEmp === e.id && (
                  <div className="mt-3 border-t border-slate-800 pt-3" onClick={(ev) => ev.stopPropagation()}>
                    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Assigned leads ({mine.length}) · {won} won
                    </div>
                    {mine.length === 0 && <div className="text-[11px] text-slate-600">No leads assigned yet.</div>}
                    <div className="space-y-1">
                      {mine.map((l) => (
                        <div key={l.id} className="flex items-center justify-between rounded bg-slate-800/50 px-2 py-1.5">
                          <span className="text-[11px] text-slate-300">
                            {INDUSTRY_ICON[l.industry]} {l.name}
                            <span className="ml-1.5 text-slate-500">{l.city}</span>
                          </span>
                          <div className="flex items-center gap-2">
                            <Badge text={l.stage} cls={`bg-slate-900 ${STAGE_COLORS[l.stage]}`} />
                            <button
                              onClick={() => onAssign(l.id, null)}
                              className="text-[10px] text-rose-400/70 hover:text-rose-400"
                              title="Unassign"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Unassigned pool + activity */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-slate-200">
          Unassigned Leads <span className="text-xs font-normal text-slate-500">({unassigned.length})</span>
        </h3>
        <div className="space-y-2">
          {unassigned.map((l) => (
            <div key={l.id} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
              <div className="text-xs font-medium text-slate-200">{INDUSTRY_ICON[l.industry]} {l.name}</div>
              <div className="mt-0.5 text-[10px] text-slate-500">
                {COUNTRY_FLAG[l.country]} {l.city} · score <span className={scoreColor(l.score)}>{l.score}</span>
              </div>
              <select
                value=""
                onChange={(e) => e.target.value && onAssign(l.id, e.target.value)}
                className="mt-2 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-[11px] text-slate-300 outline-none focus:border-sky-500"
              >
                <option value="">Assign to…</option>
                {employees
                  .filter((e) => e.role !== "Researcher")
                  .map((e) => {
                    const match = e.countries.includes(l.country) || e.industries.includes(l.industry);
                    return (
                      <option key={e.id} value={e.id}>
                        {e.name} ({e.role}){match ? " ★ good fit" : ""}
                      </option>
                    );
                  })}
              </select>
            </div>
          ))}
          {unassigned.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-800 px-4 py-8 text-center text-xs text-slate-600">
              🎉 Every lead has an owner.
            </div>
          )}
        </div>

        <h3 className="mb-2 mt-6 text-sm font-semibold text-slate-200">Today's Call Activity</h3>
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-[11px] text-slate-400">
          {calls.filter((c) => c.timestamp.startsWith(todayDate())).length} calls placed today ·{" "}
          {calls.filter((c) => c.timestamp.startsWith(todayDate()) && c.outcome === "interested").length} interested outcomes
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────
   MODULE 5 — INDUSTRY RESEARCH (crawler dashboard)
   ──────────────────────────────────────────────── */

function Research({
  insights, onNewInsights,
}: {
  insights: InsightCard[];
  onNewInsights: (cards: InsightCard[]) => void;
}) {
  const [industry, setIndustry] = useState<string>("all");
  const [country, setCountry] = useState<string>("all");
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);

  const filtered = insights.filter(
    (i) =>
      (industry === "all" || i.industry === industry) &&
      (country === "all" || i.country === country || i.country === "Global"),
  );

  const runResearch = async () => {
    setRunning(true);
    const cards = await runIndustryResearch(industry as Industry | "all", country as Country | "all");
    onNewInsights(cards);
    setRunning(false);
    setLastRun(new Date().toLocaleTimeString());
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={industry} onChange={setIndustry} allLabel="All industries"
          options={INDUSTRIES.map((i) => ({ value: i, label: cap(i) }))} />
        <Select value={country} onChange={setCountry} allLabel="All countries"
          options={COUNTRIES.map((c) => ({ value: c, label: c }))} />
        <span className="text-xs text-slate-500">{filtered.length} insight cards</span>
        <div className="ml-auto flex items-center gap-3">
          {lastRun && !running && (
            <span className="text-[11px] text-slate-500">Last crawl finished at {lastRun}</span>
          )}
          <button
            onClick={runResearch}
            disabled={running}
            className="flex items-center gap-2 rounded-md bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-violet-500 disabled:opacity-60"
          >
            {running ? (
              <>
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Crawling sources…
              </>
            ) : (
              <>🔍 Run Research</>
            )}
          </button>
        </div>
      </div>

      {running && (
        <div className="mb-4 rounded-lg border border-violet-500/30 bg-violet-500/5 px-4 py-3 text-xs text-violet-300">
          <div className="font-medium">Research crawl in progress…</div>
          <div className="mt-1 text-violet-400/70">
            Scanning Google Maps listings, review sites, owner forums and search-trend data for{" "}
            {industry === "all" ? "all industries" : cap(industry)} in {country === "all" ? "all markets" : country}.
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered
          .slice()
          .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
          .map((card) => (
            <div key={card.id} className="flex flex-col rounded-lg border border-slate-800 bg-slate-900/50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex gap-1.5">
                  <Badge text={`${INDUSTRY_ICON[card.industry]} ${cap(card.industry)}`} cls="bg-slate-800 border-slate-700 text-slate-300" />
                  <Badge
                    text={card.country === "Global" ? "🌐 Global" : `${COUNTRY_FLAG[card.country as Country]} ${card.country}`}
                    cls="bg-slate-800 border-slate-700 text-slate-400"
                  />
                </div>
                <span className="text-[10px] text-slate-600">{fmtDateTime(card.generatedAt)}</span>
              </div>
              <h4 className="mb-3 text-sm font-semibold leading-snug text-slate-100">{card.title}</h4>

              <div className="mb-3">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-rose-400/80">Common problems</div>
                <ul className="space-y-1">
                  {card.problems.map((p, i) => (
                    <li key={i} className="flex gap-1.5 text-[11px] leading-snug text-slate-400">
                      <span className="text-rose-500/60">▸</span>{p}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mb-3 rounded-md border border-amber-500/20 bg-amber-500/5 p-2.5">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-amber-400/90">
                  ⚡ Gap analysis
                </div>
                <p className="text-[11px] leading-snug text-slate-300">{card.gapAnalysis}</p>
              </div>

              <div className="mb-3">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-sky-400/80">Demand signals</div>
                <ul className="space-y-1">
                  {card.demandSignals.map((s, i) => (
                    <li key={i} className="flex gap-1.5 text-[11px] leading-snug text-slate-400">
                      <span className="text-sky-500/60">📈</span>{s}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-auto flex items-center justify-between border-t border-slate-800 pt-2.5">
                <span className="text-[10px] uppercase tracking-wider text-slate-500">Avg deal opportunity</span>
                <span className="text-sm font-bold text-emerald-400">{card.avgDealSize}</span>
              </div>
            </div>
          ))}
      </div>
      {filtered.length === 0 && !running && (
        <div className="rounded-lg border border-slate-800 px-4 py-12 text-center text-sm text-slate-500">
          No insights for this filter yet — hit <span className="text-violet-400">Run Research</span> to crawl this segment.
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────
   APP SHELL
   ──────────────────────────────────────────────── */

type Tab = "discovery" | "voice" | "pipeline" | "team" | "research";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "discovery", label: "Lead Discovery", icon: "🔎" },
  { id: "voice", label: "Voice Agent", icon: "🎙️" },
  { id: "pipeline", label: "Pipeline", icon: "📊" },
  { id: "team", label: "Team", icon: "👥" },
  { id: "research", label: "Industry Research", icon: "🧠" },
];

export default function App() {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("discovery");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [insights, setInsights] = useState<InsightCard[]>([]);
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [activeCallLead, setActiveCallLead] = useState<Lead | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [l, e, c, i] = await Promise.all([
        fetchLeads(), fetchEmployees(), fetchCallHistory(), fetchInsights(),
      ]);
      if (cancelled) return;
      setLeads(l); setEmployees(e); setCalls(c); setInsights(i);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  /* ── state mutators (each also fires the persistence service) ── */

  const updateLead = (leadId: string, patch: Partial<Lead>) => {
    setLeads((ls) =>
      ls.map((l) => {
        if (l.id !== leadId) return l;
        const next = { ...l, ...patch };
        void updateLeadRemote(next); // SERVICE: fire-and-forget persist
        return next;
      }),
    );
  };

  const handleAssign = (leadId: string, employeeId: string | null) =>
    updateLead(leadId, { assignedTo: employeeId });

  const handleStageChange = (leadId: string, stage: PipelineStage) =>
    updateLead(leadId, { stage });

  const handleCallComplete = (
    lead: Lead,
    outcome: CallOutcome,
    transcript: TranscriptLine[],
    durationSec: number,
  ) => {
    const record: CallRecord = {
      id: `C${Date.now()}`,
      leadId: lead.id,
      timestamp: todayISO(),
      durationSec,
      outcome,
      transcript,
      agentName: "Ava (AI Agent)",
    };
    void saveCallRecord(record); // SERVICE: persist call
    setCalls((cs) => [record, ...cs]);

    // Auto-advance pipeline based on outcome
    const patch: Partial<Lead> = {};
    if (outcome === "interested" && (lead.stage === "New" || lead.stage === "Contacted")) {
      patch.stage = "Interested";
    } else if (outcome !== "no_answer" && lead.stage === "New") {
      patch.stage = "Contacted";
    }
    if (outcome === "callback") {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      patch.followUpDate = d.toISOString().slice(0, 10);
    }
    if (Object.keys(patch).length > 0) updateLead(lead.id, patch);
  };

  /* ── derived stats ── */

  const stats = useMemo(() => {
    const callsToday = calls.filter((c) => c.timestamp.startsWith(todayDate())).length;
    const won = leads.filter((l) => l.stage === "Won").length;
    const lost = leads.filter((l) => l.stage === "Lost").length;
    const winRate = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : 0;
    const pipelineValue = leads
      .filter((l) => ["Contacted", "Interested", "Proposal Sent"].includes(l.stage))
      .reduce((s, l) => s + l.estimatedValue, 0);
    const noSite = leads.filter((l) => l.websiteStatus === "none").length;
    return { total: leads.length, callsToday, winRate, pipelineValue, noSite, won };
  }, [leads, calls]);

  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-[#0a0e14]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-sky-500" />
        <div className="text-sm text-slate-500">Loading LeadCaller AI…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0e14]">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-[#0a0e14]/95 backdrop-blur">
        <div className="mx-auto max-w-[1500px] px-5">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-violet-600 text-sm font-bold text-white">
                LC
              </div>
              <div>
                <span className="text-sm font-bold text-slate-100">LeadCaller AI</span>
                <span className="ml-2 hidden text-[11px] text-slate-500 sm:inline">
                  Find businesses without websites. Convert them with AI calls.
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <span className="hidden md:inline">Snehal Kanzariya</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-700 text-[10px] font-bold text-slate-200">
                SK
              </div>
            </div>
          </div>
          {/* Tabs */}
          <nav className="flex gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`whitespace-nowrap border-b-2 px-3.5 py-2.5 text-xs font-medium transition ${
                  tab === t.id
                    ? "border-sky-500 text-sky-400"
                    : "border-transparent text-slate-500 hover:text-slate-300"
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-5 py-5">
        {/* Stat cards */}
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
          <StatCard label="Total Leads" value={String(stats.total)} sub={`${stats.noSite} with no website at all`} accent="text-slate-100" />
          <StatCard label="Calls Today" value={String(stats.callsToday)} sub="AI voice-agent dials" accent="text-sky-400" />
          <StatCard label="Win Rate" value={`${stats.winRate}%`} sub={`${stats.won} deal${stats.won !== 1 ? "s" : ""} won`} accent="text-emerald-400" />
          <StatCard label="Pipeline Value" value={fmtMoney(stats.pipelineValue)} sub="Contacted → Proposal" accent="text-violet-400" />
          <StatCard label="Team" value={String(employees.length)} sub={`${new Set(leads.map((l) => l.country)).size} countries covered`} accent="text-amber-400" />
        </div>

        {tab === "discovery" && (
          <LeadDiscovery leads={leads} employees={employees} onCall={setActiveCallLead} onAssign={handleAssign} />
        )}
        {tab === "voice" && (
          <VoiceAgent leads={leads} calls={calls} script={script} onScriptChange={setScript} onCall={setActiveCallLead} />
        )}
        {tab === "pipeline" && (
          <Pipeline leads={leads} employees={employees} onStageChange={handleStageChange} onUpdateLead={updateLead} onCall={setActiveCallLead} />
        )}
        {tab === "team" && (
          <Team employees={employees} leads={leads} calls={calls} onAssign={handleAssign} />
        )}
        {tab === "research" && (
          <Research insights={insights} onNewInsights={(cards) => setInsights((i) => [...cards, ...i])} />
        )}
      </main>

      {/* Call panel modal */}
      {activeCallLead && (
        <CallPanel
          lead={activeCallLead}
          script={script}
          onClose={() => setActiveCallLead(null)}
          onComplete={(outcome, transcript, durationSec) =>
            handleCallComplete(activeCallLead, outcome, transcript, durationSec)
          }
        />
      )}
    </div>
  );
}
