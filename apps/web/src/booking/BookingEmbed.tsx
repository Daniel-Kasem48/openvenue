import { Modal } from '../Modal';

export function BookingEmbed({ url, onClose }: { url: string; onClose: () => void }) {
  const source = new URL(url);
  source.searchParams.set('embed', '1');
  const snippet = `<iframe src="${source.href.replaceAll('&', '&amp;')}" title="Venue booking" width="100%" height="850" style="border:0"></iframe>`;
  return (
    <Modal title="Embed booking" onClose={onClose}>
      <p className="muted">Paste this code into your website.</p>
      <label>
        Embed code
        <textarea
          readOnly
          rows={5}
          value={snippet}
          onFocus={(event) => event.currentTarget.select()}
        />
      </label>
    </Modal>
  );
}
