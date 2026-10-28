# Portfolio Studio: Purpose and Workflow

**Portfolio Studio is a locally operated application for managing a personal portfolio website, including its photography galleries, engineering content, and archived work.** It provides a visual interface for preparing photographs, organizing website content, and managing what appears on the published website without having to manually edit website code.

It is designed to separate three activities: **preparing content, managing the portfolio, and publishing changes to the live website.**

The current application is written in Python and runs locally on Windows and macOS. A browser-based replacement is also being developed to improve cross-platform compatibility.

## 1. What Portfolio Studio does

Portfolio Studio acts as the administrative interface for a portfolio website.

| Component | Function |
|---|---|
| **Photography** | Browse and manage published photographs, edit captions and tags, adjust gallery crops, and organize gallery order |
| **Engineering** | Access and manage the portfolio's engineering project content |
| **Archive** | Access and manage archived portfolio content |
| **Process New Photos** | Import original photographs, edit and prepare them, apply watermarks, and create web-ready images |
| **Settings** | Configure application preferences and processing options |
| **About** | Display application information and version details |

The program provides a visual workflow so that many tasks that would otherwise require editing image files, JSON catalogs, or website assets can be performed through the interface.

## 2. The complete photography workflow

```text
Original photographs (private files on user's computer)
    ↓
New Photos Processor (select, straighten, crop, resize, watermark, describe, tag)
    ↓
Website-ready files and catalog (optimized images, thumbnails, metadata)
    ↓
Photography management (review, edit, filter, arrange, save)
    ↓
GitHub Desktop (owner reviews, commits, pushes)
    ↓
Live portfolio website (GitHub Pages deploys)
```

### Step 1 — Import original photographs

The user opens **Process New Photos**, selects photographs from local storage, and imports them into the working list.

The program reads the source images, accounts for EXIF orientation, and prepares previews. Original photographs remain private and outside the public website repository.

### Step 2 — Edit and prepare photographs

The New Photos Processor offers editing and publication controls, including:

- Rotation and horizon straightening, image cropping, and gallery crop adjustments.
- Output dimensions, with a default maximum side length of 1080 pixels.
- JPEG or WebP output, image quality, and automated watermark application using the portfolio's logo.
- Photo descriptions, tags, and featured priority.
- Generation of optimized WebP thumbnails for gallery browsing.

The goal is not to replace a full photo-editing application such as Lightroom. It is to perform the final processing needed to turn an edited original into a consistent, web-ready portfolio image.

### Step 3 — Generate website files

When the user chooses to publish selected photographs *within Portfolio Studio*, the application validates the selections, generates optimized image files and thumbnails, and updates the website's structured media catalog.

The catalog, including `data/media-catalog.json`, records information the website uses to display and organize photographs.

Publishing here means preparing and saving the website's local files. It does **not** mean immediately making changes visible on the internet.

The processing system also includes conflict checks, staged file operations, and rollback protections to reduce the risk of inconsistent or incomplete updates.

### Step 4 — Manage the published photography gallery

The user returns to the **Photography** tab, which serves as the management interface for the published photo catalog.

Here, the user can review images visually, adjust captions and tags, select gallery crops, filter the collection, and manage image ordering.

The Arrange Gallery feature can suggest ordering based on visual characteristics such as color, brightness, saturation, image proportions, and tags. Users can manually rearrange or lock images, review the proposed result, and explicitly save their changes.

One current limitation is that removing an already-published image from the gallery is not yet as straightforward as importing and publishing a new one.

### Step 5 — Review changes locally

The user can inspect the resulting portfolio content and local website before deploying it publicly.

The application operates on local files. Changes made in Portfolio Studio do not automatically alter the live website.

### Step 6 — Publish to the website

The user opens GitHub Desktop, reviews the modified repository files, creates a commit, and pushes the changes to GitHub.

GitHub Pages then deploys the updated public website following the repository's deployment workflow.

**This is an important design principle:** Portfolio Studio prepares the changes, but the website owner retains exclusive control over when those changes become public.

## 3. What happens behind the scenes

Portfolio Studio coordinates several distinct systems:

| System | Role |
|---|---|
| Python application | User interface, image processing, catalog management and file operations |
| Local image storage | Retains original photographic files privately |
| Image processing pipeline | Creates resized, watermarked, optimized publication copies |
| Media catalog | Stores structured information about photographs and their presentation |
| Website source repository | Contains the files used to construct the public website |
| GitHub Desktop | Provides the owner's controlled commit-and-push process |
| GitHub Pages | Hosts and deploys the public portfolio |

The original photographs and the public copies are deliberately separated. Visitors should only receive the processed website images, not the original source files.

## 4. Current development direction

The existing Python desktop application uses Tkinter for its user interface. The intended next-generation architecture is a **locally hosted web application** that runs in a browser but continues to process and manage files on the user's computer.

An initial browser-based foundation already provides Photography, Engineering, and Archive browsing, previews, searching, appearance settings, and temporary editing. However, it does not yet replace the desktop application for saving, processing, or publishing content.

The longer-term goal is to support Windows and macOS consistently, maintain local control of private files, simplify application maintenance, and preserve the owner's exclusive authority to publish through GitHub. Mobile compatibility is not currently a primary requirement.

## 5. In one sentence

**Portfolio Studio is a private, locally operated content-management and photo-publication application that turns original photographs and other portfolio material into organized, website-ready content while keeping final publication under the owner's control.**
