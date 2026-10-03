# Trial Researcher — Personalized Concept Grounded in Research Onboarding

**Updated:** October 3, 2026.  
**User decision:** The user likes the broader trial-rehearsal idea and wants to develop it under the working name **Trial Researcher**, with personalization.  
**Critical clarification:** The experience supplied here concerns **onboarding into a research lab**. The user was not describing a trial they designed or conducted. No specific scientific research question has been supplied.  
**Status:** Product concept and proposed first workflow; no implementation or measured product results are claimed.

**Companion fictional case:** [The Student Who Could Have Started Two Weeks Earlier](Trial-Researcher-Onboarding-Case-Study.md) supplies an invented onboarding story, explicit 20-versus-10-working-day schedules, agent roles, demo screens, and sensitivity cases. Its missing-training and processing details are fictional; they are not findings about the real onboarding evidence below.

## 1. The firsthand problem

The supplied correspondence describes a student trying to become ready to contribute to a research project. The student had sent training certificates, requested access, asked about the appropriate tools and starting task, and remained interested in participating. Progress depended on several separate institutional and interpersonal steps.

An institutional IRB-system transition interrupted one onboarding path. The lab suggested another dataset so the student could still learn and contribute. That alternative later depended on access to a collaborator's workbench. Meanwhile, communication and preparation were spread across email, Slack, a getting-started guide, an onboarding SOP, and questions about other research infrastructure.

The strongest firsthand problem statement is:

> “I was trying to join a research team. I needed to know which requirements I had completed, what I was waiting for, who owned the next step, and what useful work I could do while access was pending.”

This supports a concrete product hypothesis: a personalized research workspace could make those dependencies and next actions visible. The emails alone do not establish demand across all labs or clinical-trial teams, financial losses, or a causal explanation for every day between messages.

## 2. Evidence timeline

Dates below are from the supplied correspondence and screenshot. They are historical evidence, not a live check of any account or approval system.

| Date | What the material supports | Product implication |
|---|---|---|
| July 16 | The student sent CITI certificates and requested communication access while asking about research infrastructure. | Record document submission separately from verification and access activation. |
| July 16 | The PI reported that UCSF's IRB-system transition was delaying integration. | Represent an external dependency and its source; do not invent a completion date. |
| July 16 | The student asked about the correct volume/folder, starter notebook, first task, and communication platform. | Onboarding needs a coherent sequence and a clear first assignment. |
| July 16 | The lab suggested an All of Us path and identified a collaborator as the person to help with setup. | A fallback has its own prerequisites and owners. |
| July 16 | Slack access was reported granted. | One completed step should not make the whole onboarding process appear complete. |
| September 9 | The PI said the institutional system had stabilized, requested year/major, and said the forms would be sent. | Distinguish an intention to submit, a reported submission, and a confirmed decision. |
| September 9 | The PI instructed the student to wait for explicit word before accessing the relevant data, and described restrictions on external data sharing. | Preserve project-specific access and handling requirements as sourced constraints. |
| September 27 | The student reported still lacking access to a collaborator's All of Us workbench and asked what else could be done. | Make the current blocker and useful parallel preparation visible. |
| September 29 | The supervisor said they had followed up about Tempredict access and asked the student to follow the onboarding SOP. | Connect follow-up ownership and pending access to preparation tasks. |
| October 2 | The supervisor reported that the approval process had recently progressed and should be processed soon, with further institutional delays mentioned. | Retain the original status wording and uncertainty. This does not confirm activated access. |

The inspected evidence does not establish the exact final authorization, dataset tier, workspace role, full training status, or actual technical access at the present moment. The linked SOP and getting-started guide were not supplied with accessible URLs or contents; their exact requirements should not be invented.

## 3. Two distinct paths

### Tempredict-related onboarding

The correspondence links access to a lab/institutional process and explicit clearance from the PI. It also contains questions about Nautilus, an appropriate volume/folder, and communication tools. The precise technical sequence remains unverified.

Suggested representation:

```text
Training/document evidence
          ↓
Lab/institutional onboarding process
          ↓
Explicit access clearance
          ↓
Required account/resource access
          ↓
Confirmed first permitted task
```

This is a proposed dependency view to confirm with the lab, not a claim that every actual requirement is known or that all steps must occur sequentially.

### All of Us alternative

The lab suggested a second route, but the screenshot shows a later workspace-access dependency. That means a suggested alternative should carry its own readiness record. The product should not mark it usable just because someone mentioned it as a fallback.

All of Us distinguishes public resources from Registered and Controlled Tier data accessed through the Researcher Workbench. Workbench access and collaboration have their own requirements. Therefore, the phrase “public dataset” in the historical email should not be converted into unrestricted access to all participant-level data. [Official Researcher Workbench description](https://www.researchallofus.org/data-tools/workbench/)

The app should record the user's actual access evidence and relevant workspace membership rather than inferring these from a dataset's name or carrying the Tempredict process over to the All of Us path.

## 4. The personalized product direction

**Candidate pitch:**

> “Trial Researcher turns your role, study requirements, training, permissions, and resources into a clear research-readiness plan—and lets you rehearse what happens when a dependency changes.”

The personalization should affect the available tasks, assumptions, and questions. It should include:

| Profile dimension | Example in this case | Behavior it could change |
|---|---|---|
| Role and stage | Student joining a research lab; onboarding | Explain requirements, dependencies, and initial tasks. |
| Background | User reported Data Science and rising third year in September | Adjust the level of explanation; ask about skills rather than assuming them. |
| Training evidence | Certificates were sent | Show evidence submitted; verify relevance and completion separately. |
| Access | Some communication access reported; data/workspace status pending or unconfirmed | Show which task prerequisites are satisfied or unknown. |
| Research environment | Lab infrastructure and dataset-specific workspaces | Link tasks to the appropriate environment. |
| Owners | PI, supervisor/onboarding lead, collaborator/workspace owner | Identify who can answer or act on each dependency. |
| Handling constraints | PI's stated project-specific data boundary | Present the applicable constraint beside proposed work. |
| Current assignment | Not yet established in the supplied material | Ask for the intended first task; avoid inventing a scientific aim. |

A role profile should not impersonate a named supervisor or pretend to know their unexpressed preferences. Personalize agents using documented responsibilities, requirements, and evidence.

## 5. First screen: My research readiness

The opening view could answer four questions: What is complete? What needs confirmation? What is blocked? What can I usefully do next?

An illustrative snapshot based on the supplied evidence would show:

- **Reported complete:** Certificates sent; Slack access reported granted.
- **Needs confirmation:** Applicable training requirements satisfied; actual account/resource permissions; current All of Us access level.
- **Waiting on a dependency:** Tempredict-related clearance/access; collaborator workspace access, according to the latest supplied messages.
- **Possible preparation:** Review the actual onboarding SOP once provided, read permitted documentation, prepare questions, and practice relevant methods on synthetic examples selected with the lab.
- **First research task:** Awaiting definition or confirmation from the supervisor.

Each status needs an evidence link, date, source, and owner. A dated email assertion should remain identifiable as an assertion. “No confirmation found in the uploaded material” is different from proving that the action never happened.

The app should not collapse all of this into one readiness percentage. A single unresolved access prerequisite can prevent a particular task even when many other steps are finished.

## 6. Review agents for this stage

| Agent role | Job | Example output |
|---|---|---|
| Onboarding coordinator | Convert supplied documents and messages into tasks, dependencies, and ownership. | “Your certificates were sent; the remaining access confirmation is not present in this record.” |
| Access and policy reviewer | Identify relevant sourced permissions and unknowns for a specific task. | “This proposed analysis depends on clearance that the latest supplied message still describes as pending.” |
| Research learning mentor | Suggest preparatory exercises and questions appropriate to the person's role and known skills. | “While access is pending, a synthetic-data exercise can help you learn the workflow; confirm the intended methods with your supervisor.” |

IRB/ethics and study-operations review can remain part of the later study-rehearsal workflow. Onboarding supplies the researcher-specific context those reviewers need. An agent can explain an access requirement or flag missing evidence; it cannot grant access or institutional approval.

## 7. How simulation remains central

The first scenario can be a **dependency rehearsal**:

> “If the required data access takes two more weeks, which preparation tasks remain available, which work stays blocked, and what changes if the alternative workspace becomes available sooner?”

Two weeks is a scenario input, not a forecast. The model would operate on explicit task prerequisites, known permissions, unknown requirements, and user-entered timing assumptions. It could produce a task timeline, blocked tasks, useful parallel work, and questions for the people responsible.

An alternative dataset is only useful if its prerequisites and suitability for the intended task are satisfied. Because the user's first analysis is not yet defined here, the initial app should describe candidate preparation paths rather than claim the two datasets are scientifically interchangeable.

The product cannot reliably foresee an unexpected institutional-system migration simply by having AI agents debate. It can expose reliance on that process and help the researcher rehearse a delay after entering the scenario.

## 8. One coherent hackathon demo

Use fictionalized onboarding messages and synthetic project metadata inspired by this experience. Do not present those fixtures as an institutional integration or copy real study data into the demonstration.

1. A student joins a fictional study and provides onboarding documents plus a few status updates.
2. Trial Researcher proposes a task/dependency map with exact evidence and uncertain states.
3. The student confirms the map and sees that the main data-access path is pending.
4. The alternative workspace is also waiting on a different owner, so the app shows that it does not immediately unblock analysis.
5. The student selects a hypothetical two-week delay. The app shows affected tasks and parallel preparation.
6. A new fictional confirmation arrives. The reviewer records it, the relevant task becomes ready, and unrelated permissions remain unchanged.
7. The app retains the before/after state, source, and reviewer decision.

The demonstration can then show how that same profile would inform a future protocol or study-planning review: “This researcher can use these resources, still needs these permissions, and has these unresolved preparation steps.” Building the full onboarding system and full clinical-trial simulator simultaneously would be a scope decision that needs justification.

## 9. Track 2 connection and limits of the evidence

The user's case demonstrates research onboarding friction. It does not establish that the underlying work was an interventional clinical trial. A Track 2 demonstration should explicitly place the same readiness problem in a trial team's workflow: a coordinator or analyst joins a study, needs applicable training and resource access, and must understand which preparation or study tasks can proceed.

That trial-specific application is a product adaptation to validate with a trial professional. It should not rewrite the user's history. The larger Trial Researcher concept remains a personalized preparation and rehearsal tool; this example provides an authentic entry point and a concrete initial workflow.

## 10. Validation and next useful evidence

For the prototype, prepare synthetic cases covering a submitted form, pending review, explicit clearance, workspace invitation, revoked or superseded access, an ambiguous message, a missing SOP, and two projects with different requirements. Check whether the app preserves those distinctions and links every inferred dependency to evidence or marks it as a proposed assumption.

Useful measures include missed prerequisites, false blockers, unsupported “ready” states, correct source/version references, duplicate tasks, and whether a user can identify the next action and owner. Compare with a simple checklist and a single-prompt summary to test whether the dependency view and role-based review add value.

The highest-value next inputs are the actual onboarding SOP, a confirmed first task, and feedback from someone responsible for onboarding. They would clarify which steps are institution-specific, which depend on the dataset, and which can happen in parallel. The user has clarified that they were just onboarding, so no scientific hypothesis or experiment should be assumed in their profile.

## 11. Personal origin story for the pitch

> “When I joined a research lab, I had sent my training certificates and was eager to contribute. An institutional system change delayed one access path, and the alternative depended on another workspace. I kept asking what I needed to finish, who I was waiting on, and what I could work on meanwhile. That experience inspired Trial Researcher: a personalized workspace that makes research prerequisites visible and lets a team rehearse delays and alternatives before they derail the plan.”

This story accurately frames the supplied experience as onboarding. Claims about time saved, approvals accelerated, or studies improved should follow measured results later.

## 12. Source and sharing notes

This brief draws on the user's supplied “Smarr Lab onboarding” email text, the “Workbench” screenshot, the explicit clarification “i was just onboarding,” and the prior TrialRehearsal discussion. It summarizes relevant facts without reproducing email addresses, account identifiers, scheduling links, or the full correspondence.

The PI's instruction about study-data use is included as contextual evidence of a real workflow constraint. No participant-level research data was supplied here, and no research account was accessed, message sent, or permission changed in preparing this concept expansion.

The earlier `HealthLink-Hackathon-Second-Opinion-Dossier.md` remains a historical snapshot. This brief updates its previous uncertainty about whether the user likes the direction: the user now explicitly wants to pursue the idea and personalize it. The exact MVP, implementation stack, and later study-design modules remain proposals.
