export const REGIONS = [
  { id: "Ado bayero mall", label: "Ado Bayero Mall", shortCode: "ABJ", commissionPct: 5.5 },
  { id: "Tafawa balewa refinery", label: "Tafawa Balewa Refinery", shortCode: "KN", commissionPct: 5.0 },
  { id: "Sardauna market", label: "Sardauna Market", shortCode: "KD", commissionPct: 4.5 },
];

export const GLOBAL_REGION = "Global";

export const STATE_OPTIONS = REGIONS.map((region) => ({
  value: region.id,
  label: region.label,
}));

export const STATE_ENUM = REGIONS.map((region) => region.id);

export function getRegionLabel(id) {
  const region = REGIONS.find((item) => item.id === id);
  return region ? region.label : id;
}

export function getRegionShortCode(id) {
  const region = REGIONS.find((item) => item.id === id);
  return region ? region.shortCode : id;
}
