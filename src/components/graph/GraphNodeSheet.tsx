import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
};

/** The dialog shape at the bottom of the screen (DESIGN.md Part 3). */
export function GraphNodeSheet({ visible, title, onClose }: Props) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      footer={<Button label="Close" variant="primary" onPress={onClose} />}
    />
  );
}
