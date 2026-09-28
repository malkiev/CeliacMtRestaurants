import { useState } from 'react';
import { request } from './api';
import { FormStatus, Modal, useAction } from './components';

export function DeletePhotoButton({ id, caption }: { id: string; caption: string }) {
  const [open, setOpen] = useState(false);
  const action = useAction();
  return (
    <>
      <button className="text-link danger" onClick={() => setOpen(true)}>
        Delete photo
      </button>
      {open && (
        <Modal
          title="Delete photo?"
          onClose={() => {
            if (!action.busy) setOpen(false);
          }}
        >
          <p>
            Delete “{caption}” from this place? This cannot be undone. If it is the cover, another
            available photo will be used.
          </p>
          <FormStatus error={action.error} />
          <div className="button-row">
            <button className="button" disabled={action.busy} onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              className="button primary"
              disabled={action.busy}
              onClick={() =>
                void action.run(async () => {
                  await request(`/api/photos/${id}`, undefined, 'DELETE');
                  location.reload();
                })
              }
            >
              {action.busy ? 'Deleting…' : 'Delete photo'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
