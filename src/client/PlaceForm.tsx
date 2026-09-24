import { useState, type FormEvent } from 'react';
import type { BusinessType, Member, Place } from '../shared/types';
import { CUISINES, PLACE_TYPES, SERVICES, businessTypes as getBusinessTypes } from '../shared/domain';
import {
  LOCALITIES,
  MENU_OPTIONS,
  localityLabel,
  normaliseLocality,
} from '../shared/place-options';
import { request } from './api';
import { FormStatus, Notice, SubmitButton, useAction } from './components';

type Props = {
  member: Member | null;
  place?: Place;
  initial?: Partial<Place>;
  onDone?: () => void;
  onSave?: (payload: Record<string, unknown>) => Promise<void>;
  businessTypes?: BusinessType[];
};

export function PlaceForm({ member, place, initial, onDone, onSave, businessTypes }: Props) {
  const source = place || initial;
  const a = useAction();
  const [island, setIsland] = useState<'Malta' | 'Gozo'>(source?.island || 'Malta');
  const [locality, setLocality] = useState(normaliseLocality(source?.locality || '', island));
  const [types, setTypes] = useState<string[]>(source ? getBusinessTypes(source) : []);
  const [services, setServices] = useState<string[]>(source?.services || []);
  const [cuisines, setCuisines] = useState<string[]>(source?.cuisines || []);
  const [menuOptions, setMenuOptions] = useState<string[]>(source?.menu_options || ['unknown']);
  const [premises, setPremises] = useState(source?.premises || 'unknown');
  const [pricing, setPricing] = useState(source?.price_applicability || 'applicable');
  const [minimum, setMinimum] = useState(source?.price_min == null ? '' : String(source.price_min));
  const [maximum, setMaximum] = useState(source?.price_max == null ? '' : String(source.price_max));
  if (!member)
    return (
      <Notice>
        <a href="/account">Sign in</a> to suggest a business or correction.
      </Notice>
    );
  const owner = !!place && member.ownerships.includes(place.id);
  const toggle = (values: string[], value: string, checked: boolean) =>
    checked ? [...values, value] : values.filter((v) => v !== value);
  function reveal(field: HTMLElement) {
    let parent = field.parentElement;
    while (parent) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
      parent = parent.parentElement;
    }
    field.focus();
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const typeInput = form.elements.namedItem('business_types') as RadioNodeList;
    const firstType = typeInput[0] as HTMLInputElement;
    firstType.setCustomValidity(!place && !types.length ? 'Choose at least one business type' : '');
    const invalid = form.querySelector<HTMLElement>(':invalid');
    if (invalid) {
      reveal(invalid);
      form.reportValidity();
      return;
    }
    const f = new FormData(form);
    const str = (key: string) => String(f.get(key) || '');
    const num = (key: string) => (str(key) === '' ? null : Number(str(key)));
    const payload = {
      name: str('name'),
      business_types: types,
      services,
      advance_orders: str('advance_orders'),
      premises,
      ordering_info: str('ordering_info'),
      description: str('description'),
      ...(owner || member.role === 'admin' ? { short_description: str('short_description') } : {}),
      brand_name: str('brand_name'),
      branch_name: str('branch_name'),
      locality,
      island,
      ...(source?.premises === 'none' && source.address === undefined
        ? {}
        : { address: str('address'), latitude: num('latitude'), longitude: num('longitude') }),
      cuisines,
      menu_options: menuOptions,
      price_applicability: pricing,
      price_min: minimum === '' ? null : Number(minimum),
      price_max: maximum === '' ? null : Number(maximum),
      price_basis: str('price_basis'),
      menu_info: str('menu_info'),
      website: str('website'),
      menu_url: str('menu_url'),
      social_url: str('social_url'),
      phone: str('phone'),
      business_status: place ? str('business_status') : 'open',
    };
    void a.run(
      async () => {
        try {
          if (onSave) await onSave(payload);
          else
            await request('/api/submissions', {
              kind: place ? 'correction' : 'place',
              place_id: place?.id,
              payload,
            });
          onDone?.();
        } catch (error) {
          const message = error instanceof Error ? error.message : '';
          const field = Array.from(form.elements).find(
            (el) =>
              el instanceof HTMLElement && 'name' in el && message.includes(String(el.name) + ':'),
          );
          if (field instanceof HTMLElement) reveal(field);
          throw error;
        }
      },
      onSave || member?.role === 'admin'
        ? 'Place details saved.'
        : 'Your changes are awaiting moderator approval.',
    );
  }
  return (
    <form className="stack-form" noValidate onSubmit={submit}>
      <p className="muted">
        Start with the essentials. Add any other details you know in the optional sections below.
      </p>
      <label>
        Business name
        <input name="name" required minLength={3} maxLength={120} defaultValue={source?.name} />
      </label>
      <fieldset>
        <legend>Business types{!place ? ' (choose at least one)' : ''}</legend>
        <div className="tag-options">
          {(businessTypes?.filter((type) => type.active || types.includes(type.key)) || PLACE_TYPES.map((key, index) => ({key,label:key,category:'restaurant' as const,sort_order:index,active:1}))).map((type) => (
            <label key={type.key}>
              <input
                name="business_types"
                type="checkbox"
                value={type.key}
                checked={types.includes(type.key)}
                onChange={(e) => {
                  setTypes(toggle(types, type.key, e.target.checked));
                  const first =
                    e.currentTarget.form?.querySelector<HTMLInputElement>(
                      '[name="business_types"]',
                    );
                  first?.setCustomValidity('');
                }}
              />
              {type.label === 'Cafe' ? 'Café' : type.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="form-grid">
        <label>
          Island
          <select
            name="island"
            value={island}
            onChange={(e) => {
              setIsland(e.target.value as 'Malta' | 'Gozo');
              setLocality('');
            }}
          >
            <option>Malta</option>
            <option>Gozo</option>
          </select>
        </label>
        <label>
          Locality
          <select name="locality" value={locality} onChange={(e) => setLocality(e.target.value)}>
            <option value="">Not yet known</option>
            {LOCALITIES[island].map((v) => (
              <option key={v} value={v}>
                {localityLabel(v)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset>
        <legend>Gluten-free menu options</legend>
        <p className="small muted">These describe menu information, not a safety certification.</p>
        <div className="tag-options menu-options">
          {MENU_OPTIONS.map((option) => (
            <label key={option.value}>
              <input
                name="menu_options"
                type="checkbox"
                checked={menuOptions.includes(option.value)}
                onChange={(e) => {
                  if (option.value === 'unknown') {
                    setMenuOptions(['unknown']);
                    return;
                  }
                  const next = toggle(
                    menuOptions.filter((v) => v !== 'unknown'),
                    option.value,
                    e.target.checked,
                  );
                  setMenuOptions(next.length ? next : ['unknown']);
                }}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label>
        Additional menu notes
        <textarea name="menu_info" rows={3} maxLength={500} defaultValue={source?.menu_info} />
      </label>
      <details className="optional-section">
        <summary>Services and ordering (optional)</summary>
        <div className="stack-form">
          <fieldset>
            <legend>Services</legend>
            <div className="tag-options">
              {SERVICES.map((service) => (
                <label key={service}>
                  <input
                    type="checkbox"
                    name="services"
                    checked={services.includes(service)}
                    onChange={(e) => setServices(toggle(services, service, e.target.checked))}
                  />
                  {service}
                </label>
              ))}
            </div>
            <p className="small muted">Leave blank if unknown.</p>
          </fieldset>
          <label>
            Advance orders required
            <select name="advance_orders" defaultValue={source?.advance_orders || 'unknown'}>
              <option value="unknown">Unknown</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <label>
            Ordering instructions
            <textarea
              name="ordering_info"
              maxLength={1000}
              rows={3}
              defaultValue={source?.ordering_info}
              placeholder="Lead times, collection arrangements, delivery areas…"
            />
          </label>
        </div>
      </details>
      <details className="optional-section">
        <summary>Location and contact (optional)</summary>
        <div className="stack-form">
          <label>
            Premises
            <select
              name="premises"
              value={premises}
              onChange={(e) => setPremises(e.target.value as typeof premises)}
            >
              <option value="unknown">Unknown</option>
              <option value="public">Public premises</option>
              <option value="none">No public premises</option>
            </select>
          </label>
          {premises === 'none' && (
            <p className="small muted">
              Only the locality is public. Address, directions and map coordinates are hidden.
            </p>
          )}
          <div hidden={premises === 'none'} className="stack-form">
            <label>
              Street address
              <input name="address" maxLength={250} defaultValue={source?.address} />
            </label>
            <p className="small muted">
              Map coordinates are optional and require a moderator check before publication.
            </p>
            <div className="form-grid">
              <label>
                Latitude
                <input
                  name="latitude"
                  type="number"
                  step="any"
                  min="35.7"
                  max="36.2"
                  defaultValue={source?.latitude ?? ''}
                />
              </label>
              <label>
                Longitude
                <input
                  name="longitude"
                  type="number"
                  step="any"
                  min="14.1"
                  max="14.7"
                  defaultValue={source?.longitude ?? ''}
                />
              </label>
            </div>
          </div>
          <label>
            Phone
            <input name="phone" maxLength={40} defaultValue={source?.phone} />
          </label>
          {(
            [
              ['website', 'Website'],
              ['menu_url', 'Menu link'],
              ['social_url', 'Social page'],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                name={key}
                type="url"
                pattern="https://.*"
                maxLength={1000}
                placeholder="https://"
                defaultValue={source?.[key]}
              />
            </label>
          ))}
        </div>
      </details>
      <details className="optional-section">
        <summary>About the business (optional)</summary>
        <div className="stack-form">
          <label>
            Short description
            <textarea name="short_description" rows={2} maxLength={280} placeholder="A concise introduction to this place" defaultValue={source?.short_description} readOnly={!(owner || member.role === 'admin')} />
            {!(owner || member.role === 'admin') && <span className="small muted">Only verified owners and admins can edit this description.</span>}
          </label>
          <label>
            About this place
            <textarea
              name="description"
              rows={4}
              maxLength={2000}
              defaultValue={source?.description}
            />
          </label>
          <fieldset>
            <legend>Cuisine (up to 5)</legend>
            <div className="tag-options">
              {CUISINES.map((c) => (
                <label key={c}>
                  <input
                    type="checkbox"
                    checked={cuisines.includes(c)}
                    disabled={!cuisines.includes(c) && cuisines.length >= 5}
                    onChange={(e) => setCuisines(toggle(cuisines, c, e.target.checked))}
                  />
                  {c}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </details>
      <details className="optional-section">
        <summary>Prices (optional)</summary>
        <div className="stack-form">
          <label>
            Meal pricing
            <select
              name="price_applicability"
              value={pricing}
              onChange={(e) => setPricing(e.target.value as typeof pricing)}
            >
              <option value="applicable">Per-person meal estimate (leave blank if unknown)</option>
              <option value="not_applicable">Not applicable</option>
            </select>
          </label>
          <div hidden={pricing === 'not_applicable'} className="stack-form">
            <div className="form-grid">
              <label>
                Approx. minimum € per person
                <input
                  name="price_min"
                  type="number"
                  min="0"
                  max="1000"
                  step="0.5"
                  disabled={pricing === 'not_applicable'}
                  required={maximum !== '' && pricing === 'applicable'}
                  value={minimum}
                  onChange={(e) => setMinimum(e.target.value)}
                />
              </label>
              <label>
                Approx. maximum € per person
                <input
                  name="price_max"
                  type="number"
                  min={minimum || 0}
                  max="1000"
                  step="0.5"
                  disabled={pricing === 'not_applicable'}
                  value={maximum}
                  onChange={(e) => setMaximum(e.target.value)}
                />
              </label>
            </div>
            <label>
              What does this estimate cover?
              <input
                name="price_basis"
                minLength={3}
                maxLength={160}
                required={pricing === 'applicable' && (minimum !== '' || maximum !== '')}
                defaultValue={source?.price_basis}
                placeholder="For example, main meal excluding drinks"
              />
            </label>
          </div>
        </div>
      </details>
      {place && (
        <details className="optional-section">
          <summary>Business status (optional)</summary>
          <label>
            Business status
            <select name="business_status" defaultValue={source?.business_status || 'open'}>
              <option value="open">Open</option>
              <option value="temporarily_closed">Temporarily closed</option>
              <option value="closed">Permanently closed</option>
            </select>
          </label>
        </details>
      )}
      <details className="optional-section">
        <summary>Part of a business with several locations? (optional)</summary>
        <div className="stack-form">
          <p className="small muted">
            You can skip this. For several locations of the same business, enter its shared name and
            a label such as “Valletta Waterfront”. Each location keeps its own reviews and
            verification.
          </p>
          <label>
            Shared business name (optional)
            <input name="brand_name" maxLength={120} defaultValue={source?.brand_name} />
          </label>
          <label>
            Location label (optional)
            <input name="branch_name" maxLength={120} defaultValue={source?.branch_name} />
          </label>
        </div>
      </details>
      <FormStatus {...a} />
      <SubmitButton busy={a.busy}>
        {onSave || member?.role === 'admin'
          ? 'Save place details'
          : owner
            ? 'Submit place updates'
            : 'Submit for approval'}
      </SubmitButton>
    </form>
  );
}
