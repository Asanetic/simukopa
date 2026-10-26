'use client';
import { GridSettingsPanel } from '../moduleControl/UiControl/SmartGridClean';

export default function SettingsHolder() {
  return (
    <div className="card p-4 w-100" >
      <h4 className="mb-1">Grid &amp; presentation</h4>
      <p className="text-muted">Display preferences for every grid, saved in this browser.</p>
      <GridSettingsPanel />
    </div>
  );
}
