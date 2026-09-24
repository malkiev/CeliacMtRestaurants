import { useEffect, useState } from 'react';
import type { BusinessType, GlutenFreeItem, Member, Place } from '../shared/types';
import { request } from './api';
import { FormStatus, Notice, SubmitButton, useAction } from './components';
import { PlaceForm } from './PlaceForm';

export function AdminPlaceEditor({
  place,
  member,
  reload,
  businessTypes,
  glutenFreeItems,
}: {
  place: Place;
  member: Member;
  reload: () => Promise<void>;
  businessTypes?: BusinessType[];
  glutenFreeItems?: GlutenFreeItem[];
}) {
  const a = useAction();
  const initialVerification = place.cam_verified_at
    ? !!place.cam_verified
    : !!(place.cam_verified || place.source_cam);
  const [verified, setVerified] = useState(initialVerification);
  useEffect(
    () => setVerified(initialVerification),
    [place.id, place.cam_verified, place.cam_verified_at, place.source_cam],
  );
  const representsPlace = member.ownerships.includes(place.id);
  return (
    <div className="place-editor">
      <h2>
        {place.name}
        {place.branch_name ? ` — ${place.branch_name}` : ''}
      </h2>
      {representsPlace && (
        <Notice>
          Changes to a business you represent require an independent moderator. Use this form to
          submit them for review.
        </Notice>
      )}
      {!place.business_types?.length && (
        <Notice>
          Business classification needs review. Imported type:{' '}
          {place.source_type || place.type || 'Unknown'}.
        </Notice>
      )}
      <PlaceForm
        key={`${place.id}:${place.updated_at}`}
        member={member}
        place={place}
        businessTypes={businessTypes}
        glutenFreeItems={glutenFreeItems}
        onSave={
          representsPlace
            ? undefined
            : async (payload) => {
                await request('/api/admin/places', { id: place.id, place: payload });
                await reload();
              }
        }
      />
      <hr />
      <h3>CAM verification</h3>
      <p>
        Published status: <strong>{place.cam_verified ? 'Verified' : 'Not verified'}</strong>.
      </p>
      {!place.cam_verified_at && !!place.source_cam && (
        <Notice>
          The imported directory records CAM verification. The checkbox is preselected for your
          review; saving with a check note confirms and publishes it.
        </Notice>
      )}
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void a.run(async () => {
            await request('/api/admin/cam', { place_id: place.id, verified, note: f.get('note') });
            await reload();
          }, 'CAM status saved.');
        }}
      >
        <label className="checkbox-label">
          <input
            type="checkbox"
            name="verified"
            checked={verified}
            onChange={(e) => setVerified(e.target.checked)}
          />
          Verified by CAM
        </label>
        <label>
          Check note (private)
          <textarea name="note" required minLength={3} maxLength={1000} />
        </label>
        <SubmitButton busy={a.busy}>Save CAM status</SubmitButton>
      </form>
      <hr />
      <h3>Catalogue eligibility</h3>
      <form
        key={String(place.catalogue_enabled)}
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void a.run(async () => {
            await request(`/api/admin/places/${place.id}/catalogue`, {
              enabled: f.get('catalogue_enabled') === 'on',
            });
            await reload();
          }, 'Catalogue eligibility saved.');
        }}
      >
        <label className="checkbox-label">
          <input
            name="catalogue_enabled"
            type="checkbox"
            defaultChecked={!!place.catalogue_enabled}
          />
          Product catalogue enabled
        </label>
        <p className="small muted">
          Catalogue functionality is planned separately. This flag records eligibility only.
        </p>
        <SubmitButton busy={a.busy}>Save catalogue eligibility</SubmitButton>
      </form>
      <hr />
      <h3>Checked map pin</h3>
      <p>
        {place.coordinates_checked
          ? 'This pin is checked and eligible to appear on the map.'
          : 'This pin needs a location check before it appears on the map.'}
      </p>
      {place.premises === 'none' ? (
        <Notice>This business has no public premises and cannot show a map pin.</Notice>
      ) : representsPlace ? (
        <Notice>Another moderator must check the pin for a business you represent.</Notice>
      ) : (
        <form
          key={`${place.latitude}:${place.longitude}`}
          className="stack-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void a.run(async () => {
              await request(`/api/moderation/places/${place.id}/coordinates`, {
                latitude: Number(f.get('lat')),
                longitude: Number(f.get('lng')),
              });
              await reload();
            }, 'Checked map pin saved.');
          }}
        >
          <p className="small muted">Save only after checking the restaurant's actual location.</p>
          <div className="form-grid">
            <label>
              Checked latitude
              <input
                name="lat"
                type="number"
                step="any"
                min="35.7"
                max="36.2"
                required
                defaultValue={place.latitude ?? ''}
              />
            </label>
            <label>
              Checked longitude
              <input
                name="lng"
                type="number"
                step="any"
                min="14.1"
                max="14.7"
                required
                defaultValue={place.longitude ?? ''}
              />
            </label>
          </div>
          <SubmitButton busy={a.busy}>Save checked pin</SubmitButton>
        </form>
      )}
      <FormStatus {...a} />
      <p>
        <a className="button" href={`/places/${place.slug}`}>
          View place
        </a>
      </p>
    </div>
  );
}
