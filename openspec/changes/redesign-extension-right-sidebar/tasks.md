## 1. Right-sidebar host navigation

- [x] 1.1 Remove the aggregate extension View launcher and its renderer composition/tests while preserving legacy View routing
- [x] 1.2 Keep one direct right-rail entry per visible right-sidebar contribution with declared-icon and fallback behavior
- [x] 1.3 Expand a selected extension panel to the Host-clamped preferred docked width and preserve normal resize/collapse behavior
- [x] 1.4 Confine Host-rendered extension icons to exact manifest declarations and the main renderer image CSP

## 2. Video editor extension migration

- [x] 2.1 Move the bundled video editor manifest to `views.rightSidebar`, add its packaged icon, and remove redundant open-editor UI/command contributions
- [x] 2.2 Add workspace-scoped active-project lookup to the video tool contract and persist validated active project selection
- [x] 2.3 Replace the embedded Agent prompt with a main-Agent synchronization panel and refine the responsive docked editor layout
- [x] 2.4 Update video extension tests, versioned release fixtures, README guidance, and deterministic bundled package assets
- [x] 2.5 Migrate historical installed Action IDs so the bundled right-sidebar update cannot block Kun startup

## 3. Public guidance and compatibility

- [x] 3.1 Document `views.rightSidebar` as the canonical self-registering UI in Chinese and English while retaining Extension API v1 compatibility notes
- [x] 3.2 Add or update host tests for direct icon registration, deterministic selection, legacy parse compatibility, and removal of the aggregate launcher

## 4. Verification and delivery

- [x] 4.1 Run focused renderer, extension API, video tool, package, and release-gate tests
- [x] 4.2 Run repository typecheck, lint, test, build, and OpenSpec validation
- [x] 4.3 Verify the bundled video editor in the running app as a direct right-rail panel beside the main conversation
- [x] 4.4 Commit the completed redesign on the local `develop` branch

## 5. Real-app usability follow-up

- [x] 5.1 Use the active thread workspace consistently for contribution discovery, visibility, commands, View Sessions, and extension panel rendering
- [x] 5.2 Supply the admitted active/trusted SDK workspace context whenever a workspace-scoped View activates or reactivates its Node Host
- [x] 5.3 Make video-editor theme and locale initialization independent from project/runtime requests, retain live Kun setting updates, and translate all visible reference-editor copy
- [x] 5.4 Add renderer, runtime, and video Webview regressions for workspace alignment, View activation context, failed initialization, and live locale switching
- [x] 5.5 Align the Desktop Host and Kun Runtime guest-safe View policies so permitted jobs and brokered-media methods work from the sandboxed editor
- [x] 5.6 Run focused and repository-wide validation, verify the panel in the running app in Chinese and English, and commit the follow-up on local `develop`
