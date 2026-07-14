## ADDED Requirements

### Requirement: Kun Video Editor is a direct right-sidebar extension
The bundled Kun Video Editor manifest SHALL declare one primary `views.rightSidebar` editor View with a packaged icon. It SHALL NOT require a generic extension launcher, a full-page View, or a Composer action to enter the editor.

#### Scenario: Trusted video extension is discovered
- **WHEN** `kun-examples.kun-video-editor` is enabled and trusted for the active workspace
- **THEN** its packaged video icon SHALL appear directly in Kun's right rail and clicking it SHALL open the editor beside the main conversation

### Requirement: Docked editor remains a complete usable workbench
The video Webview SHALL provide project selection, player, timeline, media and transcript controls, inspector, captions, revision history, preview, render jobs, and export in a responsive docked layout. It MUST remain keyboard reachable and usable at the Host's minimum supported extension-panel width.

#### Scenario: Editor opens at the preferred docked width
- **WHEN** the video editor View opens in the right panel
- **THEN** its controls SHALL reflow into a bounded vertical workflow without horizontal page overflow or hiding the current project and revision

### Requirement: Docked editor follows Kun appearance settings
The video Webview SHALL apply Kun's current theme, text direction, and locale independently from project and job availability. It SHALL provide complete English and Simplified Chinese user-visible copy and SHALL react to Kun appearance changes while the panel remains open.

#### Scenario: Project loading fails during initialization
- **WHEN** Kun reports a Chinese locale and light theme but the first video project request fails
- **THEN** the editor SHALL still render its failure and recovery UI in Chinese with the light theme

#### Scenario: User changes Kun language while the editor is open
- **WHEN** the user changes Kun from English to Simplified Chinese or back
- **THEN** the open video editor SHALL update its labels and document language without recreating the View Session

### Requirement: Main conversation is the primary Agent surface
The docked video editor SHALL identify the main Kun conversation as the primary place to ask for Agent editing. The panel SHALL expose the active project and revision to the registered video tools and SHALL show bounded synchronization status instead of requiring a second embedded Agent prompt surface.

#### Scenario: User asks the main Agent to edit the open video
- **WHEN** the user selects a project in the video panel and asks the main Agent to modify it
- **THEN** the Agent SHALL be able to resolve the active project, read its current revision and script, invoke the existing video tools, and cause the open panel to refresh

### Requirement: Video package remains a public extension example
The migrated video editor SHALL continue to build, validate, test, and package only through documented Extension API surfaces. Its deterministic bundled archive and release fixtures SHALL use a new version identity and SHALL not be imported privately by Kun product code.

#### Scenario: Default bundle is rebuilt
- **WHEN** the repository builds bundled extensions
- **THEN** the catalog and `.kunx` archive SHALL contain the right-sidebar manifest, packaged icon, Host entry, Webview assets, and unchanged least-authority permission set under the new version
