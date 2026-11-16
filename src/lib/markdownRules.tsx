import { Text } from 'react-native';
import type { RenderRules } from 'react-native-markdown-display';

/**
 * Shared markdown rule overrides for every note renderer.
 *
 * INTENT rule 9: nothing runs on its own. The library's default `image` rule
 * renders an RN `Image`, which fetches a remote source as soon as the note is
 * shown. No note surface may do that, so images are never rendered as images.
 * The app produces no local image sources either, so ALL images (remote or
 * not) become plain text: the alt text, then the source as non-link text.
 */
export const markdownRules: RenderRules = {
  image: (node) => {
    const src = String(node.attributes?.src ?? '');
    const alt = String(node.attributes?.alt ?? '');
    return (
      <Text key={node.key} testID="markdown-image-placeholder">
        {alt ? `[image: ${alt}]` : '[image]'}
        {src ? ` ${src}` : ''}
      </Text>
    );
  },
};
