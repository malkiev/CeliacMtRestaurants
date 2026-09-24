export const CONDITIONS = [
  'Coeliac',
  'Gluten intolerant',
  'Gluten sensitive',
  'Wheat allergy',
  'Other',
] as const;
export const SYMPTOMS = ['Never', 'Rarely', 'Sometimes', 'Always', 'I don’t know'] as const;
export const AVATAR_PRESETS = ['initials', 'sun', 'flower', 'leaf', 'wave', 'star', 'cup'] as const;
export type AvatarPreset = (typeof AVATAR_PRESETS)[number];
export type Identity = {
  id: string;
  name: string;
  avatar: { preset: AvatarPreset; url: string | null };
};
export type HealthDetails = {
  conditions: (typeof CONDITIONS)[number][];
  symptoms: (typeof SYMPTOMS)[number] | null;
};
export type PublicProfile = Identity & Partial<HealthDetails>;
export type OwnProfile = Identity & HealthDetails & { share_health: boolean };
