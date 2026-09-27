import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { ThemedText } from '@/components/themed-text';
import { Space } from '@/constants/theme';

export type ConfirmButton = {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
  disabled?: boolean;
};

type Options = {
  title: string;
  message?: string;
  buttons?: ConfirmButton[];
};

/**
 * `Alert.alert` renders the platform dialog, which is un-themeable on Android —
 * a Material slab in the middle of a Curated surface. This is the same call
 * with the same copy and the same button set, drawn in the dialog shape
 * (DESIGN.md 1.6): `surface` panel, `r-lg` corners, `elev1` footer, the
 * confirming action primary and Cancel a default beside it.
 */
export function useConfirmSheet() {
  const [options, setOptions] = useState<Options | null>(null);
  const close = useCallback(() => setOptions(null), []);

  // Callers fire this from an effect keyed on machine state, which re-renders
  // with a fresh identity each pass — without a content key that would re-open
  // the sheet forever. Re-opening the same dialog is a no-op.
  const key = options ? JSON.stringify([options.title, options.message, options.buttons]) : null;
  const confirm = useCallback((next: Options) => {
    setOptions((current) =>
      current && JSON.stringify([current.title, current.message, current.buttons]) ===
        JSON.stringify([next.title, next.message, next.buttons])
        ? current
        : next,
    );
  }, []);

  const element = options ? <ConfirmSheet options={options} onClose={close} key={key} /> : null;
  return { confirm, confirmElement: element };
}

function ConfirmSheet({ options, onClose }: { options: Options; onClose: () => void }) {
  const buttons = options.buttons ?? [{ text: 'OK', style: 'cancel' }];
  // Scrim tap / hardware back = the cancel button, so its side effects run
  // (e.g. dismissing a failed save). No cancel button = not dismissable.
  const cancelButton = buttons.find((b) => b.style === 'cancel');

  const run = (button: ConfirmButton) => {
    onClose();
    button.onPress?.();
  };

  return (
    <Sheet
      visible
      onClose={cancelButton ? () => run(cancelButton) : () => {}}
      title={options.title}
      style={styles.sheet}
      footer={
        <>
          {buttons.map((button, index) => (
            <Button
              key={button.text}
              label={button.text}
              disabled={button.disabled}
              variant={
                button.style === 'destructive'
                  ? 'danger'
                  : index === buttons.length - 1
                    ? 'primary'
                    : 'default'
              }
              onPress={() => run(button)}
            />
          ))}
        </>
      }>
      {options.message ? (
        <ThemedText type="small" themeColor="onSurfaceVar" style={styles.message}>
          {options.message}
        </ThemedText>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingBottom: Space[3] },
  message: { lineHeight: 20 },
});
