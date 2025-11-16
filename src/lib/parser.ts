interface CaseDetails {
  caseNumber?: string;
  caseType?: string;
  caseStatus?: string;
  caseDate?: string;
  caseTime?: string;
  caseLocation?: string;
  caseJudge?: string;
  batchNumber?: string;
  batchSequence?: string;
}

interface Address {
  street?: string;
  unit?: string;
  city?: string;
  state?: string;
  zipCode?: string;
}

interface Party {
  partyType?: string;
  name: string;
  address: Address;
}

interface Timeline {
  date?: string;
  eventType?: string;
  comment?: string;
}

interface CaseData {
  caseDetails: CaseDetails;
  parties: Party[];
  timeline: Timeline[];
}

export function parseCaseData(html: string): CaseData {
  // TODO: Implement parser
  return {
    caseDetails: {},
    parties: [],
    timeline: [],
  };
}
