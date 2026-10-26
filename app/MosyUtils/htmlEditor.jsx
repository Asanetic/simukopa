'use client';

import { useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import 'suneditor/dist/css/suneditor.min.css';
import { hiveRoutes } from '../appConfigs/hiveRoutes';

const SunEditor = dynamic(() => import('suneditor-react'), {
  ssr: false,
});

export default function MosyHtmlEditor({ value = '', field = "defname", onChange: handleChange }) {
  const editorRef = useRef(null);
  const previousContentRef = useRef(stripEditorPageWrapper(value)); // 🧠 Real-time, always-fresh snapshot — kept unwrapped throughout

  // Sync editor and previous content on initial load or external prop change.
  // Every keystroke round-trips: onChange -> handleChange(parent's setValue)
  // -> parent re-renders -> this `value` prop updates -> this effect fires.
  // Without the equality check below, that echo of the user's OWN edit
  // would call setContents() again on every keystroke, resetting the
  // editor's internal state (cursor position, undo stack) and letting
  // SunEditor re-normalize the HTML it's given — the actual source of
  // "breaks missing, image size messed up" while actively typing, not
  // just on reload.
  useEffect(() => {
    if (!editorRef.current) return;
    const stripped = stripEditorPageWrapper(value || '');
    if (stripped === previousContentRef.current) return; // echo of our own edit
    editorRef.current.setContents(stripped);
    previousContentRef.current = stripped;
  }, [value]);

  const handleEditorChange = async (newContent) => {
    const cleanContent = stripEditorPageWrapper(newContent);
    const wrappedContent = `<div class="smart_editor_editor_page">${cleanContent}</div>`;

    const removedImages = getRemovedImageSources(previousContentRef.current, cleanContent);
    previousContentRef.current = cleanContent; // 🔁 Update snapshot before notifying parent, so the echo above is recognized
    handleChange(wrappedContent);

    if (removedImages.length > 0) {
      console.log("🧼 Deleting removed images:", removedImages);
      await deleteImages(removedImages);
    }
  };

  return (
    <SunEditor
      ref={editorRef}
      height="400px"
      name={field}
      id={field}
      defaultValue={stripEditorPageWrapper(value)}
      onChange={handleEditorChange}
      setOptions={{
        buttonList: [
          ['undo', 'redo'],
          ['formatBlock'],
          ['bold', 'underline', 'italic', 'strike'],
          ['font', 'fontSize'],
          ['fontColor', 'hiliteColor'],
          ['align', 'horizontalRule', 'list'],
          ['table'],
          ['link', 'image', 'video'],
          ['fullScreen', 'showBlocks', 'codeView'],
        ],
        font: ['Arial', 'Tahoma', 'Comic Sans MS', 'Courier New', 'Georgia'],
        defaultStyle: 'font-family: Arial; font-size: 16px;',
        imageUploadUrl: `${hiveRoutes.hiveBaseRoute}/api/editor/uploadmedia`,
      }}
    />
  );
}

/* ------------------------------------------
   🧼 Local Helpers - tightly scoped to this file
--------------------------------------------- */

// Extracts all <img src="..."> from HTML string
function extractImageSources(html = '') {
  const container = document.createElement('div');
  container.innerHTML = html;

  const images = container.querySelectorAll('img');
  return Array.from(images)
    .map(img => img.getAttribute('src'))
    .filter(Boolean);
}

// Compares before vs after to find removed images
function getRemovedImageSources(oldHtml, newHtml) {
  const oldImgs = extractImageSources(oldHtml);
  const newImgs = extractImageSources(newHtml);

  const removedImages = oldImgs.filter(src => !newImgs.includes(src));

  console.log('📤 getRemovedImageSources', { removedImages, oldImgs, newImgs });

  return removedImages;
}

// Sends POST requests to delete images
async function deleteImages(imageUrls = []) {
  for (const src of imageUrls) {
    try {
      await fetch('/api/editor/deletemedia', {
        method: 'POST',
        body: JSON.stringify({ src }),
        headers: {
          'Content-Type': 'application/json',
        },
      });
    } catch (err) {
      console.error('[❌ Image Deletion Failed]', err);
    }
  }
}


// Strips exactly the one wrapper div this file itself adds around saved
// content. A regex like /<div class="...">([\s\S]*?)<\/div>/ is unsafe
// here — SunEditor content routinely contains its OWN nested <div>s (image
// containers, table wrappers), and the non-greedy match stops at the FIRST
// </div> it finds, which is often one of those nested ones. Everything
// after that point (remaining <br> breaks, image size attributes, etc.)
// falls outside the "stripped" region and rides along as stray raw text —
// exactly the corruption ("breaks missing, image size messed up") seen on
// reload. Since the wrapper is always applied as an exact outer prefix/
// suffix, plain string slicing is unambiguous where regex isn't.
function stripEditorPageWrapper(content = '') {
  const openTag = '<div class="smart_editor_editor_page">';
  const closeTag = '</div>';
  const trimmed = content.trim();
  if (trimmed.startsWith(openTag) && trimmed.endsWith(closeTag)) {
    return trimmed.slice(openTag.length, -closeTag.length);
  }
  return content;
}


