import { sanitizeClientBusinessProfile, sanitizeClientMediaUrl } from './client-document-policy.mjs';

export function publicPortalTheme(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const key of ['headerColor','bgColor','bgColor2','textColor','headerTextColor','headerDetailColor','cardTextColor','mutedTextColor','buttonTextColor','bgStyle','layoutStyle','portalLogo','logoSize','headerDensity','buttonStyle','cardStyle','amountDisplay']) {
    if (typeof value[key] === 'string') result[key] = key === 'portalLogo' ? sanitizeClientMediaUrl(value[key]) : value[key];
  }
  for (const key of ['bgStrength','logoScale']) {
    if (value[key] != null && String(value[key]).trim() && Number.isFinite(Number(value[key]))) result[key] = Number(value[key]);
  }
  if (typeof value.useDefault === 'boolean') result.useDefault = value.useDefault;
  return result;
}

// Call only after verifying the owner or the portal-specific PIN session.
export async function loadPortalBranding(db, owner) {
  const {data, error} = await db.from('user_data').select('key,value').eq('user_id',owner).in('key',['business_profile','company_logo','portal_theme']);
  if (error) throw error;
  const value = key => (data || []).find(row => row.key === key)?.value;
  return {businessProfile:sanitizeClientBusinessProfile(value('business_profile')), businessLogo:sanitizeClientMediaUrl(value('company_logo')?.logo || ''), portalTheme:publicPortalTheme(value('portal_theme'))};
}
