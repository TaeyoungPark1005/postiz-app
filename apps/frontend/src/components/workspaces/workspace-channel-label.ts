type ChannelLike = {
  readonly providerIdentifier: string;
  readonly displayName: string;
};

type IntegrationLike = {
  readonly identifier: string;
  readonly name: string;
};

const platformNames: Record<string, string> = {
  'instagram-standalone': 'Instagram',
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  pinterest: 'Pinterest',
  reddit: 'Reddit',
  tiktok: 'TikTok',
  threads: 'Threads',
  x: 'X',
  youtube: 'YouTube',
};

export const workspacePlatformName = (identifier: string) => {
  const key = identifier.trim().toLowerCase();
  if (platformNames[key]) {
    return platformNames[key];
  }

  return key
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

export const workspaceChannelLabel = ({
  providerIdentifier,
  displayName,
}: ChannelLike) => {
  const platform = workspacePlatformName(providerIdentifier);
  return platform ? `${platform} · ${displayName}` : displayName;
};

export const workspaceIntegrationLabel = ({
  identifier,
  name,
}: IntegrationLike) => {
  const platform = workspacePlatformName(identifier);
  return platform ? `${platform} · ${name}` : name;
};
