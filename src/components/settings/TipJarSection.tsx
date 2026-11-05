import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { ListGroup, Row } from '@/components/ui/card';
import { useConfirmSheet } from '@/components/ui/confirm-sheet';
import { Space } from '@/constants/theme';
import { canOpenSupportLink, canUseStorePurchases } from '@/lib/privacyMode';
import { TIP_PRODUCTS, type TipProductId } from '@/lib/supportConfig';
import { getSupportLinkUrl } from '@/lib/supportLink';
import {
  isTipJarSupported,
  openTipJar,
  type TipEvent,
  type TipFailure,
  type TipJarSession,
  type TipOffer,
} from '@/lib/tipJarStore';

type Phase = 'closed' | 'opening' | 'open' | 'unavailable';

export const STRICT_PRIVACY_TIP_TITLE = 'Tips are off in strict privacy';
export const STRICT_PRIVACY_TIP_MESSAGE =
  'Strict privacy keeps Curated Journal from reaching beyond this device, and a tip goes ' +
  'through the App Store or Google Play. To leave a tip, step out of strict privacy, tip, ' +
  'then step back in. Nothing was sent.';
export const STRICT_PRIVACY_LINK_MESSAGE =
  'Strict privacy keeps Curated Journal from reaching beyond this device, and the Support ' +
  'link opens a web page. To use it, step out of strict privacy first. Nothing was sent.';

const FAILURE_COPY: Record<TipFailure, string> = {
  unavailable: 'The store isn’t available right now. Try again later.',
  network: 'Couldn’t reach the store. Check your connection and try again.',
  failed: 'The tip didn’t go through. Try again later.',
  'not-finished':
    'Your tip went through, but the store hasn’t confirmed it yet. Opening the tip jar again finishes it.',
};

function tipName(id: TipProductId): string {
  return TIP_PRODUCTS.find((t) => t.id === id)?.name ?? 'tip';
}

/**
 * "Support Curated Journal" in Settings (spec 2026-11-02-tip-jar; INTENT.md
 * rules 9 and 11). Optional consumable tips through the platform store.
 *
 * The store is not contacted when Settings renders. The first store call
 * is the user's tap on Open, and only after `canUseStorePurchases()` says
 * yes — in strict privacy the tap shows an explanation instead, and
 * nothing is sent. Prices shown are the store's localized prices.
 */
export function TipJarSection() {
  const { confirm, confirmElement } = useConfirmSheet();
  const [phase, setPhase] = useState<Phase>('closed');
  const [offers, setOffers] = useState<TipOffer[]>([]);
  const [busyId, setBusyId] = useState<TipProductId | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const session = useRef<TipJarSession | null>(null);
  const mounted = useRef(true);
  const opening = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void session.current?.close();
      session.current = null;
    };
  }, []);

  const onEvent = useCallback(
    (event: TipEvent) => {
      if (!mounted.current) return;
      setBusyId(null);
      switch (event.kind) {
        case 'thanks':
          setStatus(null);
          confirm({
            title: 'Thank you!',
            message: `Your ${tipName(event.productId).toLowerCase()} helps keep Curated Journal going.`,
          });
          return;
        case 'pending':
          setStatus(
            'Your tip is pending. It completes once the store confirms the payment.',
          );
          return;
        case 'cancelled':
          // The user backed out of the store sheet: say nothing.
          return;
        case 'error':
          setStatus(FAILURE_COPY[event.reason]);
          return;
      }
    },
    [confirm],
  );

  const showStrictPrivacyAlert = (message: string) =>
    confirm({ title: STRICT_PRIVACY_TIP_TITLE, message });

  const open = async () => {
    if (!canUseStorePurchases()) {
      showStrictPrivacyAlert(STRICT_PRIVACY_TIP_MESSAGE);
      return;
    }
    if (opening.current) return;
    opening.current = true;
    setPhase('opening');
    setStatus(null);
    try {
      // Retry after an unavailable open: close the previous session first so
      // its listeners and store connection don't leak (and so endConnection
      // cannot race the new initConnection).
      const prev = session.current;
      session.current = null;
      if (prev) await prev.close();
      const next = await openTipJar(onEvent);
      if (!mounted.current) {
        void next.close();
        return;
      }
      session.current = next;
      setOffers(next.offers);
      setPhase(next.offers.length > 0 ? 'open' : 'unavailable');
    } catch (error) {
      console.warn(
        '[tipJar] open failed:',
        error instanceof Error ? error.message : String(error),
      );
      if (mounted.current) setPhase('unavailable');
    } finally {
      opening.current = false;
    }
  };

  const tip = async (id: TipProductId) => {
    // Re-asked on every tap: the mode may have changed since the jar opened.
    if (!canUseStorePurchases()) {
      showStrictPrivacyAlert(STRICT_PRIVACY_TIP_MESSAGE);
      return;
    }
    if (!session.current || busyId) return;
    setBusyId(id);
    setStatus(null);
    try {
      await session.current.requestTip(id);
    } finally {
      // The store bridge resolves without an event on some paths (e.g. a
      // duplicate purchase it can't recover); never leave the row on '…'.
      // Outcomes still arrive through onEvent and set the status text.
      if (mounted.current) setBusyId(null);
    }
  };

  if (!isTipJarSupported()) {
    const url = getSupportLinkUrl();
    if (!url) return null;
    const openLink = async () => {
      if (!canOpenSupportLink()) {
        showStrictPrivacyAlert(STRICT_PRIVACY_LINK_MESSAGE);
        return;
      }
      try {
        await Linking.openURL(url);
      } catch {
        // Popup blockers and sandboxed frames refuse the navigation; say so
        // instead of leaving the tap with no feedback.
        confirm({
          title: 'Couldn’t open the page',
          message: 'Your browser blocked the link. Copy the address from our site to reach the support page.',
        });
      }
    };
    return (
      <>
        {confirmElement}
        <ThemedText type="label" style={styles.label}>
          Support Curated Journal
        </ThemedText>
        <ListGroup>
          <Row style={styles.row} divider={false}>
            <ThemedText type="strong" style={styles.rowLabel}>
              Buy me a coffee
            </ThemedText>
            <Button label="Support" testID="support-link-button" onPress={() => void openLink()} />
          </Row>
        </ListGroup>
      </>
    );
  }

  const showOffers = phase === 'open' && offers.length > 0;

  return (
    <>
      {confirmElement}
      <ThemedText type="label" style={styles.label}>
        Support Curated Journal
      </ThemedText>
      <ListGroup>
        <Row style={styles.row} divider={showOffers || phase === 'unavailable' || status != null}>
          <View style={styles.rowLabel}>
            <ThemedText type="strong">Buy me a coffee</ThemedText>
            <ThemedText type="meta">Optional. Tips unlock nothing; the journal is whole without them.</ThemedText>
          </View>
          {phase === 'closed' || phase === 'opening' || phase === 'unavailable' ? (
            <Button
              label={phase === 'opening' ? '…' : phase === 'unavailable' ? 'Retry' : 'Open'}
              accessibilityLabel={phase === 'opening' ? 'Opening the tip jar' : undefined}
              testID="tip-jar-open"
              disabled={phase === 'opening'}
              onPress={() => void open()}
            />
          ) : null}
        </Row>
        {showOffers
          ? offers.map((offer, index) => (
              <Row
                key={offer.id}
                style={styles.row}
                divider={index < offers.length - 1 || status != null}>
                <ThemedText type="strong" style={styles.rowLabel}>
                  {offer.name}
                </ThemedText>
                <Button
                  label={busyId === offer.id ? '…' : offer.displayPrice}
                  accessibilityLabel={`Tip ${offer.name}, ${offer.displayPrice}`}
                  testID={`tip-${offer.id}`}
                  disabled={busyId != null}
                  onPress={() => void tip(offer.id)}
                />
              </Row>
            ))
          : null}
        {phase === 'unavailable' && status == null ? (
          <Row style={styles.row} divider={false}>
            <ThemedText type="meta" testID="tip-jar-status" accessibilityLiveRegion="polite">
              Tips aren’t available right now.
            </ThemedText>
          </Row>
        ) : null}
        {status != null ? (
          <Row style={styles.row} divider={false}>
            <ThemedText type="meta" testID="tip-jar-status" accessibilityLiveRegion="polite">
              {status}
            </ThemedText>
          </Row>
        ) : null}
      </ListGroup>
    </>
  );
}

const styles = StyleSheet.create({
  label: { marginTop: Space[2], marginBottom: Space[1] },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space[3] },
  rowLabel: { flex: 1 },
});
