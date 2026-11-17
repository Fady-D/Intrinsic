// Reviewed against Alphabet's 2026-09-30 10-Q, Note 7:
// https://www.sec.gov/Archives/edgar/data/1652044/000165204426000084/goog-20260930.htm
// Its VIE NCI fact is explicitly the total; the issuer extension is a subset, not an addition.
// Other issuers need an independent scope review before using a VIE-only concept as total NCI.
export const issuerConcepts: Record<string, { minority: string[]; redeemableSubset?: string }> = {
  "0001652044": {
    minority: ["NoncontrollingInterestInVariableInterestEntity"],
    redeemableSubset: "goog:RedeemableNoncontrollingInterestInVariableInterestEntity",
  },
};
