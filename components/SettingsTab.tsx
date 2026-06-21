'use client';

import { useSettings } from '@/context/SettingsContext';
import { FONT_STACKS, FONT_LABELS, type FontChoice } from '@/lib/settings';
import { SegmentedControl } from './SegmentedControl';
import { Toggle } from './Toggle';

const FONTS = Object.keys(FONT_STACKS) as FontChoice[];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="settings-section">
      <div className="settings-header">{title}</div>
      {children}
    </div>
  );
}

function Row({ label, sublabel, control }: { label: string; sublabel?: string; control: React.ReactNode }) {
  return (
    <div className="settings-row">
      <div>
        <div className="settings-label">{label}</div>
        {sublabel && <div className="settings-sublabel">{sublabel}</div>}
      </div>
      {control}
    </div>
  );
}

export default function SettingsTab() {
  const { settings, update } = useSettings();

  return (
    <div className="settings-tab">
      <h2 className="settings-title">Settings</h2>

      <Section title="Appearance">
        <Row
          label="Dark mode"
          control={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="muted" style={{ fontSize: 12 }}>
                {settings.theme === 'dark' ? 'On' : 'Off'}
              </span>
              <Toggle
                value={settings.theme === 'dark'}
                onChange={(v) => update({ theme: v ? 'dark' : 'light' })}
              />
            </div>
          }
        />

        <div className="settings-label" style={{ marginTop: 4, marginBottom: 8 }}>
          Font
        </div>
        <div className="font-grid">
          {FONTS.map((f) => (
            <button
              key={f}
              className={`font-card${settings.font === f ? ' selected' : ''}`}
              onClick={() => update({ font: f })}
            >
              <div className="font-card-label">{FONT_LABELS[f]}</div>
              <div className="font-card-preview" style={{ fontFamily: FONT_STACKS[f] }}>
                The quick brown fox
              </div>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Neuron map">
        <Row
          label="Node size"
          control={
            <SegmentedControl
              value={settings.nodeSize}
              onChange={(v) => update({ nodeSize: v as typeof settings.nodeSize })}
              options={[
                { label: 'Small', value: 'small' },
                { label: 'Medium', value: 'medium' },
                { label: 'Large', value: 'large' },
              ]}
            />
          }
        />
        <Row
          label="Text size"
          control={
            <SegmentedControl
              value={settings.labelSize}
              onChange={(v) => update({ labelSize: v as typeof settings.labelSize })}
              options={[
                { label: 'Small', value: 'small' },
                { label: 'Medium', value: 'medium' },
                { label: 'Large', value: 'large' },
              ]}
            />
          }
        />
        <Row
          label="Graph physics"
          control={
            <SegmentedControl
              value={settings.graphSpeed}
              onChange={(v) => update({ graphSpeed: v as typeof settings.graphSpeed })}
              options={[
                { label: 'Slow', value: 'slow' },
                { label: 'Normal', value: 'normal' },
                { label: 'Fast', value: 'fast' },
              ]}
            />
          }
        />
      </Section>

      <Section title="Learning">
        <Row
          label="Feedback detail"
          control={
            <SegmentedControl
              value={settings.feedbackDetail}
              onChange={(v) => update({ feedbackDetail: v as typeof settings.feedbackDetail })}
              options={[
                { label: 'Brief', value: 'brief' },
                { label: 'Standard', value: 'standard' },
                { label: 'Detailed', value: 'detailed' },
              ]}
            />
          }
        />
        <Row
          label="Voice speed"
          control={
            <SegmentedControl
              value={settings.voiceSpeed}
              onChange={(v) => update({ voiceSpeed: v as typeof settings.voiceSpeed })}
              options={[
                { label: 'Slow', value: 'slow' },
                { label: 'Normal', value: 'normal' },
                { label: 'Fast', value: 'fast' },
              ]}
            />
          }
        />
        <Row
          label="Auto-suggest next concept"
          sublabel="After scoring above 70%, Feynman suggests your next weakest concept automatically."
          control={<Toggle value={settings.autoAdvance} onChange={(v) => update({ autoAdvance: v })} />}
        />
      </Section>
    </div>
  );
}
