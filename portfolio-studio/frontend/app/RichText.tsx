import { Button, Group, Input, Paper, TextInput } from "@mantine/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState } from "react";

// Only the tags the site's project text uses; backend/site/sanitize.ts allows the same ones.
const extensions = [
  StarterKit.configure({
    blockquote: false,
    code: false,
    codeBlock: false,
    heading: false,
    horizontalRule: false,
    strike: false,
    underline: false,
    trailingNode: false,
    link: { openOnClick: false, HTMLAttributes: { target: "_blank", rel: "noopener" } },
  }),
];

interface RichTextProps {
  label: string;
  value: string;
  onChange: (html: string) => void;
}

/**
 * Edits HTML with TipTap, which keeps its own undo history while it has focus.
 * `onChange` runs only for the owner's edits, so opening a project never rewrites its body.
 */
export function RichText({ label, value, onChange }: RichTextProps) {
  const [href, setHref] = useState("");
  const shown = useRef(value);
  const editor = useEditor({
    extensions,
    content: value,
    onUpdate: ({ editor }) => {
      shown.current = editor.getHTML();
      onChange(shown.current);
    },
  });

  // The app's undo and redo change `value` from outside; show it without recording an edit.
  useEffect(() => {
    if (value === shown.current) return;
    shown.current = value;
    editor.chain().setMeta("addToHistory", false).setContent(value, { emitUpdate: false }).run();
  }, [editor, value]);

  const command = () => editor.chain().focus();
  return (
    <Input.Wrapper label={label} description="Shift+Enter starts a new line in a paragraph">
      <Group gap={4} my={4}>
        <Button size="compact-sm" variant="default" onClick={() => command().toggleBold().run()}>
          Bold
        </Button>
        <Button size="compact-sm" variant="default" onClick={() => command().toggleItalic().run()}>
          Italic
        </Button>
        <Button
          size="compact-sm"
          variant="default"
          onClick={() => command().toggleBulletList().run()}
        >
          Bullets
        </Button>
        <Button
          size="compact-sm"
          variant="default"
          onClick={() => command().toggleOrderedList().run()}
        >
          Numbers
        </Button>
        <TextInput
          size="xs"
          placeholder="https://"
          aria-label="Link address"
          value={href}
          onChange={(event) => setHref(event.currentTarget.value)}
        />
        <Button
          size="compact-sm"
          variant="default"
          disabled={!href.trim()}
          onClick={() => command().extendMarkRange("link").setLink({ href: href.trim() }).run()}
        >
          Link
        </Button>
        <Button
          size="compact-sm"
          variant="default"
          onClick={() => command().extendMarkRange("link").unsetLink().run()}
        >
          Unlink
        </Button>
      </Group>
      <Paper withBorder p="xs">
        <EditorContent editor={editor} />
      </Paper>
    </Input.Wrapper>
  );
}
