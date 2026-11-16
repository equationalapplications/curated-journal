import { Text } from 'react-native';
import type { RenderRules } from 'react-native-markdown-display';

const MAX_SRC = 80;

function displaySrc(src: string): string {
  if (/^data:/i.test(src)) {
    const type = /^data:([^;,]*)/i.exec(src)?.[1];
    return `(embedded ${type || 'data'})`;
  }
  return src.length > MAX_SRC ? `${src.slice(0, MAX_SRC)}…` : src;
}

/**
 * Shared markdown rule overrides for every note renderer.
 *
 * INTENT rule 9: nothing runs on its own. The library's default `image` rule
 * renders an RN `Image`, which fetches a remote source as soon as the note is
 * shown. No note surface may do that, so images are never rendered as images.
 * The app produces no local image sources either, so ALL images (remote or
 * not) become plain muted text: the alt text, then the source as non-link text
 * (omitted inside a link so it cannot differ from the tap target).
 */
export const markdownRules: RenderRules = {
  image: (node, _children, parents, styles) => {
    const src = String(node.attributes?.src ?? '');
    const alt = String(node.attributes?.alt ?? '');
    const inLink = (parents ?? []).some((p) => p.type === 'link' || p.type === 'blocklink');
    const shown = src && !inLink ? ` ${displaySrc(src)}` : '';
    return (
      <Text
        key={node.key}
        style={[styles.text, styles.imagePlaceholder]}
        testID="markdown-image-placeholder"
        accessibilityLabel={alt ? `Image not loaded: ${alt}` : 'Image not loaded'}
      >
        {alt ? `[image not loaded: ${alt}]` : '[image not loaded]'}
        {shown}
      </Text>
    );
  },
};
