import { canOpenSupportLink, canUseStorePurchases, getPrivacyMode } from '@/lib/privacyMode';
import { getSupportLinkUrl as nativeSupportLink } from '@/lib/supportLink';
import { getSupportLinkUrl as webSupportLink } from '@/lib/supportLink.web';
import { SUPPORT_PAYPAL_URL, TIP_PRODUCT_IDS } from '@/lib/supportConfig';

describe('privacy mode (modes not built yet)', () => {
  it('always reports the default mode today', () => {
    expect(getPrivacyMode()).toBe('default');
  });

  it('allows store purchases and the support link in the default mode', () => {
    expect(canUseStorePurchases()).toBe(true);
    expect(canOpenSupportLink()).toBe(true);
  });
});

describe('support config', () => {
  it('uses the same three product IDs on both stores', () => {
    expect(TIP_PRODUCT_IDS).toEqual(['cj_tip_coffee_299', 'cj_tip_coffee_499', 'cj_tip_coffee_999']);
  });

  it('never shows the web link on native', () => {
    expect(nativeSupportLink('https://www.paypal.com/x')).toBeNull();
  });

  it('shows the web link only once a real https URL is set', () => {
    expect(SUPPORT_PAYPAL_URL).toBe('');
    expect(webSupportLink()).toBeNull();
    expect(webSupportLink('   ')).toBeNull();
    expect(webSupportLink('javascript:alert(1)')).toBeNull();
    expect(webSupportLink('https://www.paypal.com/x')).toBe('https://www.paypal.com/x');
  });
});
