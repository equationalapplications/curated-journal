import type { ComponentProps } from 'react';
import { Asset } from 'expo-asset';
import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { ThemedText } from '@/components/themed-text';
import type { SkiaGraphCanvas } from './SkiaGraphCanvas';

type Props = ComponentProps<typeof SkiaGraphCanvas>;

// Skia binds to CanvasKit when @shopify/react-native-skia is first imported, so on web
// the canvas module must be imported lazily after CanvasKit's wasm has loaded. Metro
// serves the wasm as an asset (see metro.config.js), so it isn't copied into public/.
const canvasKitWasm = Asset.fromModule(require('canvaskit-wasm/bin/full/canvaskit.wasm'));

export function GraphCanvas(props: Props) {
  return (
    <WithSkiaWeb<Props>
      opts={{ locateFile: () => canvasKitWasm.uri }}
      getComponent={() => import('./SkiaGraphCanvas').then((m) => ({ default: m.SkiaGraphCanvas }))}
      fallback={<ThemedText>Loading graph…</ThemedText>}
      componentProps={props}
    />
  );
}
