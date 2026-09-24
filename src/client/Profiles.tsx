import { useEffect, useRef, useState } from 'react';
import { Sun, Flower2, Leaf, Waves, Star, Coffee } from 'lucide-react';
import {
  AVATAR_PRESETS,
  CONDITIONS,
  SYMPTOMS,
  type Identity,
  type OwnProfile,
  type PublicProfile,
} from '../shared/profiles';
import { request } from './api';
import { FormStatus, Notice, SubmitButton, useAction } from './components';
import { drawAvatar, prepareAvatar } from './avatar-processing';

const icons = { sun: Sun, flower: Flower2, leaf: Leaf, wave: Waves, star: Star, cup: Coffee };
export function Avatar({ person, large = false }: { person: Identity; large?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  const url = person.avatar.url;
  const Icon = person.avatar.preset === 'initials' ? null : icons[person.avatar.preset];
  const initials = person.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => Array.from(part)[0])
    .join('')
    .toUpperCase();
  return (
    <span className={`profile-avatar${large ? ' large' : ''}`} aria-hidden="true">
      {url && failed !== url ? (
        <img src={url} alt="" onError={() => setFailed(url)} />
      ) : Icon ? (
        <Icon />
      ) : (
        initials || '?'
      )}
    </span>
  );
}
export function AuthorIdentity({ author, name }: { author?: Identity | null; name: string }) {
  return author ? (
    <a className="author-identity" href={`/users/${encodeURIComponent(author.id)}`}>
      <Avatar person={author} />
      <strong>{author.name}</strong>
    </a>
  ) : (
    <strong>{name}</strong>
  );
}
export function PublicProfilePage({ profile }: { profile: PublicProfile }) {
  return (
    <article className="page narrow public-profile">
      <a className="text-link" href="/">
        Back to places
      </a>
      <div className="profile-heading">
        <Avatar person={profile} large />
        <h1>{profile.name}</h1>
      </div>
      <p className="muted">Community member</p>
      {(!!profile.conditions?.length || profile.symptoms != null) && (
        <section className="detail-section">
          <h2>Shared by {profile.name}</h2>
          <p className="small muted">Optional, self-reported information.</p>
          {!!profile.conditions?.length && (
            <>
              <h3>Conditions</h3>
              <ul>
                {profile.conditions.map((condition) => (
                  <li key={condition}>{condition}</li>
                ))}
              </ul>
            </>
          )}
          {profile.symptoms != null && (
            <>
              <h3>Symptoms after eating gluten or wheat</h3>
              <p>{profile.symptoms}</p>
            </>
          )}
        </section>
      )}
    </article>
  );
}

function ProfileFields({
  initial,
  onSaved,
}: {
  initial: OwnProfile;
  onSaved: (profile: OwnProfile) => Promise<void>;
}) {
  const [name, setName] = useState(initial.name);
  const [conditions, setConditions] = useState(initial.conditions);
  const [symptoms, setSymptoms] = useState(initial.symptoms);
  const [share, setShare] = useState(initial.share_health);
  const action = useAction();
  return (
    <form
      className="stack-form"
      onSubmit={(e) => {
        e.preventDefault();
        void action.run(async () => {
          const profile = await request<OwnProfile>(
            '/api/my/profile',
            { name, conditions, symptoms, share_health: share },
            'PATCH',
          );
          setName(profile.name);
          await onSaved(profile);
        }, 'Profile saved.');
      }}
    >
      <label>
        Display name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={2}
          maxLength={60}
          autoComplete="nickname"
        />
      </label>
      <p className="small muted">
        Your display name and avatar are public and appear on your reviews and replies. Changes
        appear immediately.
      </p>
      <fieldset>
        <legend>Conditions (optional)</legend>
        <div className="profile-conditions">
          {CONDITIONS.map((condition) => (
            <label key={condition}>
              <input
                type="checkbox"
                checked={conditions.includes(condition)}
                onChange={(e) =>
                  setConditions(
                    e.target.checked
                      ? [...conditions, condition]
                      : conditions.filter((value) => value !== condition),
                  )
                }
              />
              {condition}
            </label>
          ))}
        </div>
      </fieldset>
      <label>
        How often do you notice symptoms after eating gluten or wheat?
        <select
          value={symptoms ?? ''}
          onChange={(e) => setSymptoms((e.target.value as OwnProfile['symptoms']) || null)}
        >
          <option value="">Not answered</option>
          {SYMPTOMS.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <label className="profile-sharing">
        <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
        Show my conditions and symptom frequency on my public profile.
      </label>
      <p className="small muted">
        These answers are optional and self-reported. They stay private unless you turn sharing on.
        Turning it off hides them without deleting your answers.
      </p>
      <FormStatus {...action} />
      <SubmitButton busy={action.busy}>Save profile</SubmitButton>
    </form>
  );
}

function AvatarCropper({
  file,
  onSaved,
  onCancel,
}: {
  file: File;
  onSaved: (profile: OwnProfile) => Promise<void>;
  onCancel: () => void;
}) {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [error, setError] = useState('');
  const [crop, setCrop] = useState({ zoom: 1, x: 50, y: 50 });
  const preview = useRef<HTMLCanvasElement>(null);
  const action = useAction();
  useEffect(() => {
    let cancelled = false;
    let decoded: ImageBitmap | undefined;
    void createImageBitmap(file)
      .then((image) => {
        decoded = image;
        if (cancelled) image.close();
        else if (!image.width || !image.height) setError('Could not read this photo.');
        else setBitmap(image);
      })
      .catch(() => {
        if (!cancelled)
          setError('Could not read this photo. Try another JPEG, PNG, or WebP image.');
      });
    return () => {
      cancelled = true;
      decoded?.close();
    };
  }, [file]);
  useEffect(() => {
    if (bitmap && preview.current) {
      try {
        drawAvatar(preview.current, bitmap, crop);
      } catch {
        setError('Could not process this photo.');
      }
    }
  }, [bitmap, crop]);
  return (
    <div className="avatar-cropper">
      <h3>Crop your photo</h3>
      <p className="small">
        Adjust the square preview before saving. Your original photo is discarded.
      </p>
      {error ? (
        <Notice error>{error}</Notice>
      ) : !bitmap ? (
        <p role="status">Loading photo…</p>
      ) : (
        <>
          <canvas
            ref={preview}
            className="avatar-preview"
            aria-label="Square avatar preview"
            role="img"
          />
          {(['zoom', 'x', 'y'] as const).map((key) => (
            <label key={key}>
              {key === 'zoom' ? 'Zoom' : key === 'x' ? 'Horizontal position' : 'Vertical position'}
              <input
                type="range"
                min={key === 'zoom' ? 1 : 0}
                max={key === 'zoom' ? 3 : 100}
                step={key === 'zoom' ? 0.05 : 1}
                value={crop[key]}
                disabled={action.busy}
                onChange={(e) => setCrop({ ...crop, [key]: Number(e.target.value) })}
              />
            </label>
          ))}
          <button
            className="button primary"
            type="button"
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                const blob = await prepareAvatar(bitmap, crop);
                const body = new FormData();
                body.set('avatar', blob, 'avatar.jpg');
                const response = await fetch('/api/my/avatar', { method: 'POST', body });
                const result = (await response.json()) as OwnProfile & { error?: string };
                if (!response.ok)
                  throw new Error(result.error || 'Photo upload failed. Please try again.');
                await onSaved(result);
              }, 'Avatar saved.')
            }
          >
            {action.busy ? 'Saving…' : 'Save photo'}
          </button>
        </>
      )}
      <button className="button" type="button" disabled={action.busy} onClick={onCancel}>
        Cancel photo
      </button>
      <FormStatus {...action} />
    </div>
  );
}

export function ProfileEditor({ refresh }: { refresh: () => Promise<void> }) {
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const action = useAction();
  const load = () => {
    setError('');
    return request<OwnProfile>('/api/my/profile')
      .then(setProfile)
      .catch(() => setError('Could not load your profile. Please try again.'));
  };
  useEffect(() => {
    let active = true;
    void request<OwnProfile>('/api/my/profile')
      .then((value) => {
        if (active) setProfile(value);
      })
      .catch(() => {
        if (active) setError('Could not load your profile. Please try again.');
      });
    return () => {
      active = false;
    };
  }, []);
  async function saved(value: OwnProfile) {
    setProfile(value);
    await refresh();
  }
  if (!profile)
    return (
      <section className="detail-section">
        <h2>Your profile</h2>
        {error ? (
          <>
            <Notice error>{error}</Notice>
            <button className="button" onClick={() => void load()}>
              Retry profile
            </button>
          </>
        ) : (
          <p role="status">Loading profile…</p>
        )}
      </section>
    );
  return (
    <section className="detail-section profile-editor">
      <h2>Your profile</h2>
      <div className="profile-heading">
        <Avatar person={profile} large />
        <a className="text-link" href={`/users/${encodeURIComponent(profile.id)}`}>
          View your public profile
        </a>
      </div>
      <fieldset className="avatar-picker" disabled={action.busy || !!file}>
        <legend>Choose an avatar</legend>
        <div className="avatar-options">
          {AVATAR_PRESETS.map((preset) => (
            <button
              type="button"
              className="avatar-option"
              key={preset}
              aria-label={preset === 'initials' ? 'Use initials' : `Use ${preset} avatar`}
              aria-pressed={!profile.avatar.url && profile.avatar.preset === preset}
              onClick={() =>
                void action.run(async () => {
                  await saved(
                    await request<OwnProfile>(
                      '/api/my/profile',
                      { avatar_preset: preset },
                      'PATCH',
                    ),
                  );
                }, 'Avatar saved.')
              }
            >
              <Avatar person={{ ...profile, avatar: { preset, url: null } }} />
              <span>
                {preset === 'initials' ? 'Initials' : preset[0].toUpperCase() + preset.slice(1)}
              </span>
            </button>
          ))}
        </div>
        <label className="avatar-upload">
          Or choose a photo
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const selected = e.target.files?.[0];
              e.target.value = '';
              if (!selected) return;
              void action.run(async () => {
                if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type))
                  throw new Error('Choose a JPEG, PNG, or WebP photo.');
                if (selected.size > 10 * 1024 * 1024)
                  throw new Error('Choose an original photo no larger than 10 MB.');
                setFile(selected);
              }, '');
            }}
          />
        </label>
        <p className="small muted">
          JPEG, PNG or WebP, up to 10 MB. Stored avatars use at most 100 KB.
        </p>
        {profile.avatar.url && (
          <button
            className="text-link"
            type="button"
            onClick={() =>
              void action.run(async () => {
                await saved(await request<OwnProfile>('/api/my/avatar', undefined, 'DELETE'));
              }, 'Photo removed.')
            }
          >
            Remove photo
          </button>
        )}
      </fieldset>
      <FormStatus {...action} />
      {file && (
        <AvatarCropper
          file={file}
          onCancel={() => setFile(null)}
          onSaved={async (value) => {
            await saved(value);
            setFile(null);
          }}
        />
      )}
      <ProfileFields initial={profile} onSaved={saved} />
    </section>
  );
}
