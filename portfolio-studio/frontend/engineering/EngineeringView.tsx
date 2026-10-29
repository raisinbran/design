import {
  Button,
  Checkbox,
  Group,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useState } from "react";
import type { Catalogs } from "../../backend/api/api";
import { editCatalogs } from "../app/editor";
import { ItemList, moveItem, newId, removeItem } from "../app/ItemList";
import { siteImage } from "../app/portfolio";
import { RichText } from "../app/RichText";

type Project = Catalogs["engineering"]["projects"][number];
type Media = Project["media"][number];

function editProjects(change: (projects: Project[]) => Project[]) {
  editCatalogs((catalogs) => ({
    ...catalogs,
    engineering: { ...catalogs.engineering, projects: change(catalogs.engineering.projects) },
  }));
}

function editProject(index: number, change: (project: Project) => Project) {
  editProjects((projects) =>
    projects.map((project, at) => (at === index ? change(project) : project)),
  );
}

// Engineering media have no id, so each row's key is its path, numbered when a path repeats.
function mediaKeys(media: Media[]): string[] {
  const seen = new Map<string, number>();
  return media.map(({ src }) => {
    const count = seen.get(src) ?? 0;
    seen.set(src, count + 1);
    return `${src}#${count}`;
  });
}

export function EngineeringView({ catalog }: { catalog: Catalogs["engineering"] }) {
  const [selected, setSelected] = useState(0);
  const [title, setTitle] = useState("");
  const project = catalog.projects[selected];

  function addProject() {
    const id = newId(
      title,
      catalog.projects.map((item) => item.id),
    );
    editProjects((projects) => [
      ...projects,
      {
        id,
        title: title.trim(),
        heading: "",
        context: "",
        bodyHtml: "",
        cover: "",
        coverPosition: "50% 50%",
        media: [],
        visible: true,
        expanded: false,
        hero: false,
      },
    ]);
    setSelected(catalog.projects.length);
    setTitle("");
  }

  return (
    <Group align="flex-start" wrap="nowrap">
      <Stack w={340} gap="xs">
        <Group gap="xs" wrap="nowrap">
          <TextInput
            flex={1}
            placeholder="New project title"
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
          />
          <Button variant="default" disabled={!title.trim()} onClick={addProject}>
            Add
          </Button>
        </Group>
        <ItemList
          items={catalog.projects.map((item) => ({
            key: item.id,
            label: item.title,
            image: item.cover && siteImage(item.cover),
            hidden: !item.visible,
          }))}
          selected={selected}
          onSelect={setSelected}
          onMove={(from, to) => {
            editProjects((projects) => moveItem(projects, from, to));
            setSelected(to);
          }}
        />
      </Stack>
      {project && (
        <ProjectEditor
          key={project.id}
          project={project}
          index={selected}
          onRemove={() => {
            editProjects((projects) => removeItem(projects, selected));
            setSelected(Math.max(0, selected - 1));
          }}
        />
      )}
    </Group>
  );
}

interface ProjectEditorProps {
  project: Project;
  index: number;
  onRemove: () => void;
}

function ProjectEditor({ project, index, onRemove }: ProjectEditorProps) {
  const [selected, setSelected] = useState(0);
  const edit = (values: Partial<Project>) =>
    editProject(index, (current) => ({ ...current, ...values }));
  const editMedia = (change: (media: Media[]) => Media[]) =>
    editProject(index, (current) => ({ ...current, media: change(current.media) }));
  const keys = mediaKeys(project.media);
  const media = project.media[selected];

  return (
    <Stack flex={1}>
      <Text size="sm" c="dimmed">
        Page anchor: #{project.id}
      </Text>
      <TextInput
        label="Title"
        value={project.title}
        onChange={(event) => edit({ title: event.currentTarget.value })}
      />
      <TextInput
        label="Heading"
        value={project.heading}
        onChange={(event) => edit({ heading: event.currentTarget.value })}
      />
      <TextInput
        label="Context"
        description="The line under the heading, such as the employer"
        value={project.context}
        onChange={(event) => edit({ context: event.currentTarget.value })}
      />
      <TextInput
        label="Cover path"
        placeholder="images/Folder/cover.jpg"
        value={project.cover}
        onChange={(event) => edit({ cover: event.currentTarget.value })}
      />
      <TextInput
        label="Cover position"
        placeholder="50% 50%"
        value={project.coverPosition}
        onChange={(event) => edit({ coverPosition: event.currentTarget.value })}
      />
      <Group>
        <Checkbox
          label="Visible"
          checked={project.visible}
          onChange={(event) => edit({ visible: event.currentTarget.checked })}
        />
        <Checkbox
          label="Expanded"
          description="Open when the page loads"
          checked={project.expanded}
          onChange={(event) => edit({ expanded: event.currentTarget.checked })}
        />
        <Checkbox
          label="Hero"
          description="A taller header with a darker shade"
          checked={project.hero}
          onChange={(event) => edit({ hero: event.currentTarget.checked })}
        />
      </Group>
      <RichText label="Body" value={project.bodyHtml} onChange={(bodyHtml) => edit({ bodyHtml })} />
      <Group justify="space-between">
        <Title order={5}>Media</Title>
        <Button
          variant="default"
          onClick={() => {
            editMedia((items) => [
              ...items,
              { kind: "image", src: "", alt: "", caption: "", credit: "" },
            ]);
            setSelected(project.media.length);
          }}
        >
          Add media
        </Button>
      </Group>
      <ItemList
        items={project.media.map((item, at) => ({
          key: keys[at],
          label: item.caption || item.src || "New media",
          image:
            item.kind === "image"
              ? item.src && siteImage(item.src)
              : item.poster && siteImage(item.poster),
        }))}
        selected={selected}
        onSelect={setSelected}
        onMove={(from, to) => {
          editMedia((items) => moveItem(items, from, to));
          setSelected(to);
        }}
      />
      {media && (
        <MediaEditor
          media={media}
          onChange={(values) =>
            editMedia((items) =>
              items.map((item, at) => (at === selected ? { ...item, ...values } : item)),
            )
          }
          onRemove={() => {
            editMedia((items) => removeItem(items, selected));
            setSelected(Math.max(0, selected - 1));
          }}
        />
      )}
      <Group>
        <Button color="red" variant="light" onClick={onRemove}>
          Remove project
        </Button>
        <Text size="sm" c="dimmed">
          Removing never deletes image or video files.
        </Text>
      </Group>
    </Stack>
  );
}

interface MediaEditorProps {
  media: Media;
  onChange: (values: Partial<Media>) => void;
  onRemove: () => void;
}

function MediaEditor({ media, onChange, onRemove }: MediaEditorProps) {
  return (
    <Stack gap="xs">
      <SegmentedControl
        data={[
          { value: "image", label: "Image" },
          { value: "video", label: "Video" },
        ]}
        value={media.kind}
        // Images have no poster.
        onChange={(kind) =>
          onChange(kind === "image" ? { kind: "image", poster: undefined } : { kind: "video" })
        }
      />
      <TextInput
        label={media.kind === "image" ? "Image path" : "Video path"}
        placeholder={media.kind === "image" ? "images/Folder/photo.jpg" : "video/Folder/clip.mp4"}
        value={media.src}
        onChange={(event) => onChange({ src: event.currentTarget.value })}
      />
      {media.kind === "image" ? (
        <TextInput
          label="Alt text"
          description="Read aloud by screen readers"
          value={media.alt}
          onChange={(event) => onChange({ alt: event.currentTarget.value })}
        />
      ) : (
        <TextInput
          label="Poster path"
          description="The image shown before the video plays"
          value={media.poster ?? ""}
          onChange={(event) => onChange({ poster: event.currentTarget.value || undefined })}
        />
      )}
      <TextInput
        label="Caption"
        value={media.caption}
        onChange={(event) => onChange({ caption: event.currentTarget.value })}
      />
      <TextInput
        label="Credit"
        value={media.credit}
        onChange={(event) => onChange({ credit: event.currentTarget.value })}
      />
      <TextInput
        label="Position"
        description="The point kept in view when the gallery crops the media"
        placeholder="50% 50%"
        value={media.position ?? ""}
        onChange={(event) => onChange({ position: event.currentTarget.value || undefined })}
      />
      <Group>
        <Button color="red" variant="light" onClick={onRemove}>
          Remove media
        </Button>
      </Group>
    </Stack>
  );
}
