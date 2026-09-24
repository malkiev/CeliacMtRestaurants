import type { GlutenFreeItem } from '../shared/types';
import { request } from './api';
import { FormStatus, SubmitButton, useAction } from './components';

export function GlutenFreeItemsPanel({ items, onSaved }: { items: GlutenFreeItem[]; onSaved: () => Promise<void> }) {
  const action = useAction();
  return <div className="admin-panel">
    <h2>Gluten-free food items</h2>
    <p>Manage the choices available on place forms. Inactive items remain visible on existing listings.</p>
    <FormStatus {...action}/>
    {[...items, null].map(item => <details key={item?.key || 'new'} open={!item}>
      <summary>{item?.label || 'Add a food item'}</summary>
      <form className="stack-form" onSubmit={event => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        void action.run(async () => {
          const value = {
            ...(!item ? { key: String(data.get('key')) } : {}),
            label: String(data.get('label')),
            sort_order: Number(data.get('sort_order')),
            active: data.get('active') === 'on',
          };
          await request(item ? `/api/admin/gluten-free-items/${encodeURIComponent(item.key)}` : '/api/admin/gluten-free-items', value, item ? 'PATCH' : 'POST');
          await onSaved();
          if (!item) form.reset();
        }, 'Food item saved');
      }}>
        {!item && <label>Stable key<input name="key" pattern="[a-z][a-z0-9_]{1,63}" required placeholder="chicken_nuggets"/></label>}
        <label>Label<input name="label" required minLength={2} maxLength={80} defaultValue={item?.label || ''}/></label>
        <label>Display order<input name="sort_order" type="number" min={0} max={10000} defaultValue={item?.sort_order ?? 0}/></label>
        <label className="checkbox-label"><input name="active" type="checkbox" defaultChecked={item ? !!item.active : true}/>Active for new selections</label>
        <SubmitButton busy={action.busy}>Save food item</SubmitButton>
      </form>
    </details>)}
  </div>;
}
