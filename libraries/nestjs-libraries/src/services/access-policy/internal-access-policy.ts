const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

const splitCsv = (value?: string) =>
  (value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

export const internalAccessPolicy = {
  allowedDomains() {
    return splitCsv(process.env.POSTIZ_ALLOWED_EMAIL_DOMAINS);
  },

  inviteOnly() {
    return TRUE_VALUES.has(
      (process.env.POSTIZ_INVITE_ONLY || '').trim().toLowerCase()
    );
  },

  allowWorkspaceCreationForInternalUsers() {
    const value = process.env.POSTIZ_ALLOW_WORKSPACE_CREATION_FOR_INTERNAL_USERS;
    return !value || TRUE_VALUES.has(value.trim().toLowerCase());
  },

  isEmailAllowed(email: string) {
    const domains = this.allowedDomains();
    if (!domains.length) {
      return true;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const domain = normalizedEmail.split('@').pop();
    return !!domain && domains.includes(domain);
  },

  assertEmailAllowed(email: string) {
    if (!this.isEmailAllowed(email)) {
      throw new Error('This Postiz fork is restricted to internal email domains');
    }
  },

  assertWorkspaceCreationAllowed(email: string) {
    this.assertEmailAllowed(email);
    if (!this.allowWorkspaceCreationForInternalUsers()) {
      throw new Error('Workspace creation is disabled for internal users');
    }
  },
};
