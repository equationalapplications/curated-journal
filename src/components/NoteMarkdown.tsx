import type { ComponentProps } from 'react';
// eslint-disable-next-line no-restricted-imports -- the single sanctioned import
import Markdown from 'react-native-markdown-display';

import { markdownRules } from '@/lib/markdownRules';

type Props = Omit<ComponentProps<typeof Markdown>, 'rules' | 'renderer'>;

/**
 * The only way to render note Markdown. Always applies `markdownRules`
 * (INTENT rule 9: no remote image fetch). Direct imports of
 * `react-native-markdown-display` are lint-forbidden elsewhere.
 */
export function NoteMarkdown(props: Props) {
  return <Markdown {...props} renderer={undefined} rules={markdownRules} />;
}
