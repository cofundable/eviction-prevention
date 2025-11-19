import type * as cheerio from "cheerio";

/**
 * Type alias for cheerio Root (returned from cheerio.load()).
 * This is the selector function that can be used to query the DOM.
 */
export type Root = cheerio.Root;

/**
 * Type alias for cheerio selection/wrapper.
 */
export type Cheerio = cheerio.Cheerio;

/**
 * Type alias for cheerio element.
 */
export type Element = cheerio.Element;

export interface CaseDetails {
  courtSystem?: string;
  location?: string;
  caseNumber?: string;
  title?: string;
  caseType?: string;
  filingDate?: string;
  caseStatus?: string;
}

export interface Address {
  street?: string;
  unit?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  line1?: string;
  line2?: string;
  line3?: string;
}

export enum PartyType {
  LANDLORD = "landlord",
  TENANT = "tenant",
  AGENT = "agent",
  ATTORNEY = "attorney",
}

export interface Party {
  partyType?: PartyType | string;
  name: string;
  address: Address;
  appearanceDate?: string;
  representedParty?: string;
}

export interface Timeline {
  date?: string;
  eventType?: string;
  comment?: string;
}

export interface CaseData {
  caseDetails: CaseDetails;
  parties: Party[];
  timeline: Timeline[];
}
