import React, { useEffect, useRef, useState } from "react";
import type {
  ArchiveCollection,
  ArchiveMedia,
  DisplayPriority,
  EngineeringMedia,
  EngineeringProject,
  Photo,
  WorkspaceCatalogs,
} from "../models";
import type { WorkspaceView } from "../contracts";
import { movePhoto, suggestArrangement } from "./editor-state";
import { CompanionLaunchControl } from "./companion-controls";
const priorities: DisplayPriority[] = [
  "low",
  "normal",
  "portraitBoost",
  "featured",
];
export function Field({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}
function TagsField({
  photoKey,
  tags,
  onChange,
}: {
  photoKey: string;
  tags: string[];
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(tags.join(", "));
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (document.activeElement !== input.current) setDraft(tags.join(", "));
  }, [photoKey, tags.join(", ")]);
  return (
    <label className="field">
      <span>Tags (comma separated)</span>
      <input
        ref={input}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          onChange(event.target.value);
        }}
        onBlur={() => setDraft(tags.join(", "))}
      />
    </label>
  );
}
function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={value}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}
function Priority({
  value,
  onChange,
}: {
  value: DisplayPriority;
  onChange: (value: DisplayPriority) => void;
}) {
  return (
    <label className="field">
      <span>Prominence</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as DisplayPriority)}
      >
        {priorities.map((priority) => (
          <option key={priority}>{priority}</option>
        ))}
      </select>
    </label>
  );
}
export function WorkspaceImage({
  workspaceId,
  relative,
  alt,
}: {
  workspaceId: string;
  relative: string;
  alt: string;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    setUrl("");
    if (relative)
      void window.portfolio
        .readWorkspaceImage(workspaceId, relative)
        .then((value) => {
          if (active) setUrl(value);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [workspaceId, relative]);
  return url ? (
    <img className="workspace-image" src={url} alt={alt} />
  ) : (
    <div className="image-empty" aria-label={alt || "Image unavailable"}>
      Image preview unavailable
    </div>
  );
}
/** HTML editing uses an allowlist, with no active content or remote resources in the editor. */
export function cleanRichText(html: string): string {
  const document = new DOMParser().parseFromString(html, "text/html");
  const allowed = new Set([
    "P",
    "BR",
    "STRONG",
    "B",
    "EM",
    "I",
    "U",
    "UL",
    "OL",
    "LI",
    "H2",
    "H3",
    "BLOCKQUOTE",
    "A",
    "SPAN",
  ]);
  for (const node of Array.from(document.body.querySelectorAll("*"))) {
    if (["SCRIPT", "STYLE", "IFRAME", "OBJECT"].includes(node.tagName)) {
      node.remove();
      continue;
    }
    if (!allowed.has(node.tagName)) {
      node.replaceWith(...Array.from(node.childNodes));
      continue;
    }
    for (const attribute of Array.from(node.attributes))
      if (
        !(
          node.tagName === "A" &&
          attribute.name === "href" &&
          /^(https?:|mailto:)/i.test(attribute.value)
        )
      )
        node.removeAttribute(attribute.name);
    if (node.tagName === "A") node.setAttribute("rel", "noreferrer");
  }
  return document.body.innerHTML;
}
function RichText({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const editor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (editor.current && document.activeElement !== editor.current)
      editor.current.innerHTML = cleanRichText(value);
  }, [value]);
  return (
    <div className="rich-editor">
      <div className="toolbar" aria-label="Text formatting">
        {[
          ["bold", "Bold"],
          ["italic", "Italic"],
          ["insertUnorderedList", "Bullets"],
          ["insertOrderedList", "Numbering"],
        ].map(([command, label]) => (
          <button
            key={command}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              editor.current?.focus();
              document.execCommand(command);
              if (editor.current)
                onChange(cleanRichText(editor.current.innerHTML));
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        ref={editor}
        className="rich-body"
        contentEditable
        role="textbox"
        aria-label="Project rich text"
        aria-multiline
        suppressContentEditableWarning
        onPaste={(event) => {
          event.preventDefault();
          document.execCommand(
            "insertText",
            false,
            event.clipboardData.getData("text/plain"),
          );
          if (editor.current) onChange(cleanRichText(editor.current.innerHTML));
        }}
        onInput={(event) =>
          onChange(cleanRichText(event.currentTarget.innerHTML))
        }
      />
    </div>
  );
}
interface Props {
  workspace: WorkspaceView;
  catalogs: WorkspaceCatalogs;
  section: string;
  change: (catalogs: WorkspaceCatalogs) => void;
  report: (message: string) => void;
  locks: Set<string>;
  setLocks: (locks: Set<string>) => void;
}
export function StudioEditor({
  workspace,
  catalogs,
  section,
  change,
  report,
  locks,
  setLocks,
}: Props) {
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    setSelected("");
    setQuery("");
  }, [section, workspace.id]);
  if (section === "Photography") {
    const photos = catalogs.photography.photos;
    const photo = photos.find((item) => item.file === selected) || photos[0];
    const patch = (values: Partial<Photo>) =>
      change({
        ...catalogs,
        photography: {
          ...catalogs.photography,
          photos: photos.map((item) =>
            item.file === photo.file ? { ...item, ...values } : item,
          ),
        },
      });
    const order = (photos: Photo[]) =>
      change({ ...catalogs, photography: { ...catalogs.photography, photos } });
    return (
      <div className="editor-grid">
        <section className="record-list">
          <div className="list-heading">
            <strong>{photos.length} photographs</strong>
            <button
              disabled={photos.length < 2}
              onClick={() => {
                order(suggestArrangement(photos, locks));
                report("Arrangement suggestion staged. Review before saving.");
              }}
            >
              Suggest Arrangement
            </button>
          </div>
          <input
            aria-label="Filter photographs"
            placeholder="Find by description, tag, or filename"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="record-scroll">
            {photos
              .filter((item) =>
                `${item.alt} ${item.file} ${item.tags.join(" ")}`
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .map((item) => (
                <button
                  className="record"
                  key={item.file}
                  aria-pressed={photo?.file === item.file}
                  onClick={() => setSelected(item.file)}
                >
                  <span className="record-title">{item.alt || item.file}</span>
                  <small>{item.file}</small>
                  <span>
                    {item.visible ? "Visible" : "Hidden"}
                    {locks.has(item.file) ? " · Locked" : ""}
                  </span>
                </button>
              ))}
          </div>
        </section>
        <section className="record-detail">
          {photo ? (
            <>
              <WorkspaceImage
                workspaceId={workspace.id}
                relative={`photography/${photo.thumbnail ? "thumbnails/" + photo.thumbnail : "published/" + photo.file}`}
                alt={photo.alt}
              />
              <Field
                label="Description / alternative text"
                value={photo.alt}
                onChange={(alt) => patch({ alt })}
                multiline
              />
              <TagsField
                key={photo.file}
                photoKey={photo.file}
                tags={photo.tags}
                onChange={(value) => {
                  const tags = value
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean);
                  change({
                    ...catalogs,
                    photography: {
                      ...catalogs.photography,
                      photoTags: [
                        ...new Set([
                          ...catalogs.photography.photoTags,
                          ...tags,
                        ]),
                      ],
                      photos: photos.map((item) =>
                        item.file === photo.file ? { ...item, tags } : item,
                      ),
                    },
                  });
                }}
              />
              <Priority
                value={photo.displayPriority}
                onChange={(displayPriority) => patch({ displayPriority })}
              />
              <div className="toolbar">
                <Toggle
                  label="Visible"
                  value={photo.visible}
                  onChange={(visible) => patch({ visible })}
                />
                <Toggle
                  label="Featured"
                  value={photo.featured}
                  onChange={(featured) => patch({ featured })}
                />
                <Toggle
                  label="Lock position"
                  value={locks.has(photo.file)}
                  onChange={(locked) => {
                    const next = new Set(locks);
                    if (locked) next.add(photo.file);
                    else next.delete(photo.file);
                    setLocks(next);
                  }}
                />
              </div>
              <div className="toolbar">
                {[-1, 1].map((offset) => {
                  const from = photos.indexOf(photo);
                  const to = from + offset;
                  return (
                    <button
                      key={offset}
                      disabled={
                        to < 0 ||
                        to >= photos.length ||
                        locks.has(photo.file) ||
                        locks.has(photos[to]?.file)
                      }
                      onClick={() => order(movePhoto(photos, from, to, locks))}
                    >
                      Move {offset < 0 ? "Up" : "Down"}
                    </button>
                  );
                })}
              </div>
              <details>
                <summary>Prepare or Reframe Photographs</summary>
                <CompanionLaunchControl workspace={workspace} report={report} />
              </details>
            </>
          ) : (
            <p>
              No photographs yet. Use Photo Processor to publish your first
              image.
            </p>
          )}
        </section>
      </div>
    );
  }
  if (section === "Engineering") {
    const projects = catalogs.engineering.projects;
    const project =
      projects.find((item) => item.id === selected) || projects[0];
    const update = (projects: EngineeringProject[]) =>
      change({
        ...catalogs,
        engineering: { ...catalogs.engineering, projects },
      });
    const patch = (values: Partial<EngineeringProject>) =>
      update(
        projects.map((item) =>
          item.id === project.id ? { ...item, ...values } : item,
        ),
      );
    return (
      <div className="editor-grid">
        <section className="record-list">
          <button
            onClick={() => {
              const id = `project-${crypto.randomUUID()}`;
              update([
                ...projects,
                {
                  id,
                  title: "New Project",
                  heading: "",
                  context: "",
                  bodyHtml: "<p></p>",
                  cover: "",
                  coverPosition: "50% 50%",
                  media: [],
                  visible: true,
                  expanded: false,
                },
              ]);
              setSelected(id);
            }}
          >
            Add Project
          </button>
          <div className="record-scroll">
            {projects.map((item) => (
              <button
                className="record"
                key={item.id}
                aria-pressed={project?.id === item.id}
                onClick={() => setSelected(item.id)}
              >
                {item.title}
                <small>{item.media.length} media items</small>
              </button>
            ))}
          </div>
        </section>
        <section className="record-detail">
          {project && (
            <>
              <Field
                label="Project title"
                value={project.title}
                onChange={(title) => patch({ title })}
              />
              <Field
                label="Heading"
                value={project.heading}
                onChange={(heading) => patch({ heading })}
              />
              <Field
                label="Context"
                value={project.context}
                onChange={(context) => patch({ context })}
              />
              <Field
                label="Cover image (portfolio relative path)"
                value={project.cover}
                onChange={(cover) => patch({ cover })}
              />
              <Field
                label="Cover position"
                value={project.coverPosition}
                onChange={(coverPosition) => patch({ coverPosition })}
              />
              <div className="toolbar">
                <Toggle
                  label="Visible"
                  value={project.visible}
                  onChange={(visible) => patch({ visible })}
                />
                <Toggle
                  label="Expanded"
                  value={project.expanded}
                  onChange={(expanded) => patch({ expanded })}
                />
              </div>
              <label className="field">
                <span>Project body</span>
              </label>
              <RichText
                key={project.id}
                value={project.bodyHtml}
                onChange={(bodyHtml) => patch({ bodyHtml })}
              />
              <h3>Mixed Media</h3>
              <MediaList
                media={project.media}
                update={(media) => patch({ media })}
              />
              <div className="toolbar">
                {[-1, 1].map((offset) => (
                  <button
                    key={offset}
                    disabled={
                      projects.indexOf(project) + offset < 0 ||
                      projects.indexOf(project) + offset >= projects.length
                    }
                    onClick={() => {
                      const next = [...projects];
                      const from = next.indexOf(project);
                      [next[from], next[from + offset]] = [
                        next[from + offset],
                        next[from],
                      ];
                      update(next);
                    }}
                  >
                    Move {offset < 0 ? "Up" : "Down"}
                  </button>
                ))}
                <button
                  className="danger"
                  onClick={() => {
                    if (confirm("Remove this project from the staged catalog?"))
                      update(projects.filter((item) => item.id !== project.id));
                  }}
                >
                  Remove Project
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    );
  }
  const collections = catalogs.archive.collections;
  const collection =
    collections.find((item) => item.id === selected) || collections[0];
  const update = (collections: ArchiveCollection[]) =>
    change({ ...catalogs, archive: { ...catalogs.archive, collections } });
  const patch = (values: Partial<ArchiveCollection>) =>
    update(
      collections.map((item) =>
        item.id === collection.id ? { ...item, ...values } : item,
      ),
    );
  return (
    <div className="editor-grid">
      <section className="record-list">
        <button
          onClick={() => {
            const id = `collection-${crypto.randomUUID()}`;
            update([
              ...collections,
              {
                id,
                title: "New Collection",
                heading: "",
                context: "",
                cover: "",
                coverPosition: "50% 50%",
                coverSize: "cover",
                headerMinHeight: "10em",
                expanded: false,
                media: [],
              },
            ]);
            setSelected(id);
          }}
        >
          Add Collection
        </button>
        <div className="record-scroll">
          {collections.map((item) => (
            <button
              className="record"
              key={item.id}
              aria-pressed={collection?.id === item.id}
              onClick={() => setSelected(item.id)}
            >
              {item.title}
              <small>{item.media.length} images</small>
            </button>
          ))}
        </div>
      </section>
      <section className="record-detail">
        {collection && (
          <>
            <Field
              label="Collection title"
              value={collection.title}
              onChange={(title) => patch({ title })}
            />
            <Field
              label="Heading"
              value={collection.heading}
              onChange={(heading) => patch({ heading })}
            />
            <Field
              label="Context"
              value={collection.context}
              onChange={(context) => patch({ context })}
            />
            <Field
              label="Cover path"
              value={collection.cover}
              onChange={(cover) => patch({ cover })}
            />
            <Field
              label="Cover position"
              value={collection.coverPosition}
              onChange={(coverPosition) => patch({ coverPosition })}
            />
            <Toggle
              label="Expanded"
              value={collection.expanded}
              onChange={(expanded) => patch({ expanded })}
            />
            <h3>Collection Images</h3>
            {collection.media.map((media, index) => {
              const edit = (values: Partial<ArchiveMedia>) =>
                patch({
                  media: collection.media.map((item, at) =>
                    at === index ? { ...item, ...values } : item,
                  ),
                });
              return (
                <fieldset key={media.id}>
                  <legend>Image {index + 1}</legend>
                  <Field
                    label="Image path"
                    value={media.src}
                    onChange={(src) => edit({ src })}
                  />
                  <Field
                    label="Alternative text"
                    value={media.alt}
                    onChange={(alt) => edit({ alt })}
                  />
                  <Field
                    label="Caption"
                    value={media.caption}
                    onChange={(caption) => edit({ caption })}
                  />
                  <Field
                    label="Credit"
                    value={media.credit}
                    onChange={(credit) => edit({ credit })}
                  />
                  <Priority
                    value={media.prominence || "normal"}
                    onChange={(prominence) => edit({ prominence })}
                  />
                  <Field
                    label="Image position"
                    value={media.position}
                    onChange={(position) => edit({ position })}
                  />
                  <label className="field">
                    Crop mode
                    <select
                      value={media.cropMode}
                      onChange={(event) =>
                        edit({
                          cropMode: event.target.value as "natural" | "square",
                        })
                      }
                    >
                      <option>natural</option>
                      <option>square</option>
                    </select>
                  </label>
                  <div className="toolbar">
                    <button
                      disabled={index === 0}
                      onClick={() => {
                        const next = [...collection.media];
                        [next[index - 1], next[index]] = [
                          next[index],
                          next[index - 1],
                        ];
                        patch({ media: next });
                      }}
                    >
                      Move Up
                    </button>
                    <button
                      disabled={index === collection.media.length - 1}
                      onClick={() => {
                        const next = [...collection.media];
                        [next[index + 1], next[index]] = [
                          next[index],
                          next[index + 1],
                        ];
                        patch({ media: next });
                      }}
                    >
                      Move Down
                    </button>
                    <button
                      onClick={() =>
                        patch({
                          media: collection.media.filter(
                            (_, at) => at !== index,
                          ),
                        })
                      }
                    >
                      Remove Image
                    </button>
                  </div>
                </fieldset>
              );
            })}
            <button
              onClick={() =>
                patch({
                  media: [
                    ...collection.media,
                    {
                      id: `image-${crypto.randomUUID()}`,
                      src: "",
                      alt: "",
                      caption: "",
                      credit: "",
                      cropMode: "natural",
                      displayRatio: null,
                      position: "50% 50%",
                      prominence: "normal",
                      figureAttributes: {},
                      imageAttributes: {},
                    },
                  ],
                })
              }
            >
              Add Image
            </button>
            <div className="toolbar">
              {[-1, 1].map((offset) => (
                <button
                  key={offset}
                  disabled={
                    collections.indexOf(collection) + offset < 0 ||
                    collections.indexOf(collection) + offset >=
                      collections.length
                  }
                  onClick={() => {
                    const next = [...collections];
                    const from = next.indexOf(collection);
                    [next[from], next[from + offset]] = [
                      next[from + offset],
                      next[from],
                    ];
                    update(next);
                  }}
                >
                  Move Collection {offset < 0 ? "Up" : "Down"}
                </button>
              ))}
              <button
                className="danger"
                onClick={() => {
                  if (
                    confirm("Remove this collection from the staged catalog?")
                  )
                    update(
                      collections.filter((item) => item.id !== collection.id),
                    );
                }}
              >
                Remove Collection
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
function MediaList({
  media,
  update,
}: {
  media: EngineeringMedia[];
  update: (media: EngineeringMedia[]) => void;
}) {
  return (
    <>
      {media.map((item, index) => {
        const patch = (values: Partial<EngineeringMedia>) =>
          update(
            media.map((entry, at) =>
              at === index ? { ...entry, ...values } : entry,
            ),
          );
        return (
          <fieldset key={index}>
            <legend>Media {index + 1}</legend>
            <label className="field">
              Type
              <select
                value={item.kind}
                onChange={(event) =>
                  patch({ kind: event.target.value as "image" | "video" })
                }
              >
                <option>image</option>
                <option>video</option>
              </select>
            </label>
            <Field
              label="Portfolio relative path"
              value={item.src}
              onChange={(src) => patch({ src })}
            />
            <Field
              label="Alternative text"
              value={item.alt}
              onChange={(alt) => patch({ alt })}
            />
            <Field
              label="Caption"
              value={item.caption}
              onChange={(caption) => patch({ caption })}
            />
            <Field
              label="Credit"
              value={item.credit}
              onChange={(credit) => patch({ credit })}
            />
            <div className="toolbar">
              <button
                disabled={index === 0}
                onClick={() => {
                  const next = [...media];
                  [next[index - 1], next[index]] = [
                    next[index],
                    next[index - 1],
                  ];
                  update(next);
                }}
              >
                Move Up
              </button>
              <button
                disabled={index === media.length - 1}
                onClick={() => {
                  const next = [...media];
                  [next[index + 1], next[index]] = [
                    next[index],
                    next[index + 1],
                  ];
                  update(next);
                }}
              >
                Move Down
              </button>
              <button
                onClick={() => update(media.filter((_, at) => at !== index))}
              >
                Remove Media
              </button>
            </div>
          </fieldset>
        );
      })}
      <button
        onClick={() =>
          update([
            ...media,
            { kind: "image", src: "", alt: "", caption: "", credit: "" },
          ])
        }
      >
        Add Media
      </button>
    </>
  );
}
