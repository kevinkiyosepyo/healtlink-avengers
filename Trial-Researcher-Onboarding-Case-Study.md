# Trial Researcher: The Student Who Could Have Started Two Weeks Earlier

**Detailed fictional onboarding case and simulation blueprint**<br>
**Prepared:** October 3, 2026<br>
**Working product:** Trial Researcher<br>
**Hackathon connection:** Track 2 — AI-Powered Clinical Trials

> **Fictional demonstration.** Every institution, character, study, procedural requirement, processing time, dialogue, and numerical outcome in this scenario is invented. The timeline was constructed to illustrate a two-week improvement; it is not a measured product result or a forecast for an actual lab. Public policy references are identified separately.

## 1. The story in one paragraph

Alex is a third-year data-science student joining an existing clinical research team for a six-week rotation. Alex has sent training certificates and assumes the next step is to wait for permission to access the study workspace. However, the packet does not demonstrate one required training component, the coordinator discovers that problem only after intake, and the lab postpones all technical setup until after authorization. With the original sequence, Alex becomes ready for the assigned data task on **November 2**. Trial Researcher rehearses the workflow on the first day, identifies the missing evidence, and finds that an empty workspace can be prepared while the complete personnel submission is reviewed. With those changes, Alex becomes ready on **October 19: exactly 14 calendar days earlier** in this illustrative calendar.

The same human authorities make the decisions, and the complete submission takes the same amount of review time in both versions. The benefit comes from making hidden dependencies visible before they become delays.

## 2. The scenario question

**What if a student could rehearse the next month of onboarding before spending it waiting?**

The scenario combines a training-evidence mismatch, a personnel-modification process, a technical preparation queue, and a six-week rotation. These are explicit modeling assumptions rather than findings about any real person's onboarding.

> **Product demonstration:** “We built a fictional onboarding scenario to show how a simulation could reveal two weeks of avoidable delay.”

## 3. The fictional study and people

### Research setting

**Cedar Bay University** is conducting **REST-101**, an already-approved pilot clinical trial involving 40 adult volunteers. Participants are assigned to one of two sleep-coaching schedules and contribute wearable measurements and weekly questionnaires over eight weeks. These invented details provide an operational setting; the demonstration makes no claim about treatment effectiveness.

Alex joins the existing team to help with data-quality checks. Alex is not designing the trial, recruiting participants, obtaining consent, delivering the intervention, or making clinical decisions.

The first intended assignment is:

> Produce a supervised report identifying missing wearable files, inconsistent visit labels, and incomplete questionnaire records in the authorized study extract.

The extract contains participant codes and study measurements. Alex will not receive the identity-linking key. The fictional study nevertheless restricts access to individually authorized team members. Calling records “coded” does not itself establish that access is unrestricted.

### People and responsibilities

| Person | Fictional role | What they control |
|---|---|---|
| Alex | Third-year student, six-week rotation, 12 hours per week | Completing preparation, supplying evidence, attending orientation |
| Dr. Maya Chen | Principal investigator, or PI | Confirming responsibilities and authorizing the lab's submission |
| Jordan Ellis | Study coordinator and onboarding lead | Checking the packet, submitting the personnel change, tracking responses |
| Sam Rivera | Research computing administrator | Preparing the empty environment and activating the approved data-access role |
| Research review office | Personnel-modification intake and review | Reviewing the complete submission and issuing the recorded decision |
| Local data steward | Study data-release oversight | Confirming the decision, training, assigned role, and access scope |

The rotation begins **Monday, October 5, 2026** and ends at the start of **Monday, November 16**, giving six modeled workweeks. Alex can learn during onboarding; the simulation measures readiness for the assigned restricted-data task, not whether any useful work happens beforehand.

## 4. The invented rules behind the calculation

For this example, assume the fictional coordinator has confirmed these local requirements:

1. The personnel packet needs applicable human-subjects training evidence, a study-role description, an affiliation record, a data-handling acknowledgment, and PI confirmation.
2. This study requires a recorded personnel-modification decision before it releases data to Alex. Complete-packet review takes **five working days**, including normal intake.
3. An incomplete submission is returned after **three working days** of initial screening. Correcting the evidence and coordinating resubmission takes **four additional working days** in the baseline case.
4. After the decision, local release checks take **two working days**. Study-specific orientation and role documentation are completed within this stage in both versions.
5. Identity setup, MFA, package installation, and testing in a separate empty or fabricated-data environment take **three working days** of elapsed queue and setup time. They may begin before study-data authorization once initial sponsorship and request details are ready.
6. Final production-role activation and verification take **one working day**, after authorization, local release checks, and technical preparation are all complete.
7. The PI, coordinator, student, and computing administrator are available for the scheduled work. Resource conflicts would require recalculation.

**Calendar convention:** Working days are Monday through Friday, with no holiday closures in this illustrative institution. Dates mark start and completion boundaries: a two-working-day task starting Monday, October 5 finishes at the start of Wednesday, October 7. Actual institutional calendars may differ.

These are scenario parameters, not universal IRB requirements or promised processing times. UC San Diego's published FAQ, for example, lists amendment submission, appropriate training, role training, and updated team records as conditions for new key personnel to participate; it distinguishes those conditions from access to the IRB project record. A real deployment must use the applicable institution's rules. [UC San Diego IRB FAQs](https://irb.ucsd.edu/researchers/faqs.html)

A training-related return is a realistic type of administrative dependency: NIH's modification instructions state that missing or outdated required training in its system can cause a study-team modification to be returned. This supports the mechanism, not the fictional dates or policy. [NIH IRBO: Protocol Modifications](https://irbo.nih.gov/conducting-your-study/protocol-modifications/)

## 5. Version A: onboarding without the rehearsal

### October 5–7: the packet looks ready

On the first morning, Alex emails two certificates and an introduction. One course documents general research conduct; the other documents privacy awareness. The fictional local matrix also requires a particular human-subjects component, **HS-02**, which the attachments do not demonstrate.

The shared checklist has a field labeled “Training certificates received.” Jordan checks it. That accurately describes receipt, but the team treats the checkmark as verification that the requirement is satisfied.

Alex asks how to enter the analysis workspace. Jordan says access will be arranged after the personnel process. Nobody separates empty-environment preparation from activation of the study-data role.

The PI confirms the proposed responsibilities, and Jordan submits the packet on October 7. A submission receipt exists; this example is not relying on a draft being mistaken for an actual submission.

### October 7–12: the first hidden delay

On October 12, the review office returns the packet with an invented deficiency notice:

> “Please supply evidence satisfying training requirement HS-02 and ensure that the personnel-role description matches the requested data access.”

This is a request to correct an incomplete packet, not a finding that the trial is unethical or a rejection of Alex as a researcher.

Alex had interpreted “I sent my certificates” as completion. Jordan had interpreted the checkmark similarly. The discrepancy becomes visible only after three working days have passed.

### October 12–16: a small task becomes a long handoff

The correction consumes four working days of elapsed time:

- One day to identify the exact missing component and reconcile the checklist with the training matrix.
- One day before Alex's next available study block, when the component and evidence upload are completed.
- One day for coordinator verification and clarification of the role description.
- One day for PI confirmation and resubmission through the normal handoff process.

The active training work is assumed to take about two hours. The four days mostly reflect waiting and coordination, not four days of coursework. With the requirements visible and work blocks reserved, this work could fit inside the original two-day preparation window.

Jordan resubmits the complete packet on October 16.

### October 16–23: the complete submission is reviewed

The packet takes the assumed five working days to review and is accepted October 23. This example assumes an office-level personnel-modification workflow. It does not invent a full-board meeting or assign decision authority to AI personas.

Alex sees that the modification is approved and expects immediate access. Another dependency is about to become visible.

### October 23–27: local release checks

The data steward checks the decision, role, training, orientation record, and permitted data scope. These checks take two working days in the scenario.

The authorization conditions are now satisfied. The computer environment is still unprepared.

### October 27–30: a second queue begins

The team opens the computing request. Sam confirms identity setup, configures MFA, creates an empty analysis environment, installs packages, and runs a fabricated-data notebook.

These tasks take three working days. They did not require access to the real study extract, but the checklist placed everything under a single item: “Get access.”

### October 30–November 2: finally ready

Sam activates the authorized study role, confirms the intended folder is reachable, and verifies with Alex that the notebook runs in the permitted environment. This final step takes one working day.

**Alex becomes ready on November 2, four calendar weeks after onboarding began. Two weeks remain in the rotation.**

## 6. What Trial Researcher sees on the first morning

The demo supplies six small, entirely fictional inputs:

| Input | Relevant content | What the product extracts |
|---|---|---|
| Onboarding SOP v3 | Required documents and responsible people | Tasks, owners, supporting passages |
| Training matrix | HS-02 requirement for Alex's role | Exact evidence to verify |
| Two course records | Course titles, dates, completion status | What the submitted records actually establish |
| Role description | Supervised data-quality work; no participant contact | Relevant permissions and preparation tasks |
| Computing policy §4.2 | Empty environments may be prepared before final clearance | A permitted parallel branch |
| Rotation and availability plan | Six-week window, 12 hours/week, mentor work blocks | Calendar constraints and impact of delay |

The simulation needs workflow information. It does not need participant records to calculate this case.

### Finding 1: receipt is being confused with verification

The training comparison surfaces:

> “Two certificates are present. Neither supplied record establishes HS-02 completion. Ask the coordinator whether equivalent evidence exists; if it does not, complete the missing requirement before submission.”

Missing evidence is not proof of missing training. In this invented case, Jordan confirms the component remains outstanding. Only then does the model use the correction branch.

### Finding 2: technical preparation is unnecessarily sequential

The workflow analysis surfaces:

> “The checklist places all computing work after clearance. Computing Policy §4.2 permits empty-environment preparation earlier. Split preparation from production activation.”

This creates a parallel path without granting study-data access early. In the demo, move the preparation block underneath the review lane and recalculate the completion date.

### Finding 3: one broad status hides several milestones

Replace “Waiting for IRB” with separately evidenced states:

1. Packet complete and ready to submit.
2. Submission receipt recorded.
3. Review response pending.
4. Decision recorded.
5. Local release checks complete.
6. Empty environment ready.
7. Production role activated and tested.
8. First authorized task ready.

A scenario date is a planning output. It does not mark a real requirement complete or substitute for its supporting evidence.

## 7. The personalized agents

### Research-administration reviewer

**Context:** Alex is a student joining an existing study for supervised data work.

**Example output:**

> “HS-02 evidence is unresolved. Do not model the packet as complete until Jordan verifies equivalent evidence or records completion. The role description should also specify that Alex will not recruit participants or access the identity key.”

The agent produces a requirement-to-evidence table, source references, missing items, and the person who can resolve them.

### Research computing and access reviewer

**Context:** Alex needs an analysis environment and a limited study-data role.

**Example output:**

> “Identity setup, MFA, package installation, and fabricated-data testing can proceed under Computing Policy §4.2. Production access remains dependent on the recorded release conditions.”

The agent separates preparation from activation and identifies the source supporting each dependency.

### Onboarding coordinator

**Context:** Alex has a six-week rotation, limited weekly hours, and known coordinator and PI work blocks.

**Example output:**

> “Reserve training and verification during the first two working days. Submit the complete packet October 7. Open the empty-environment request that day. Prepare the first-task checklist while review is pending.”

The agent proposes owners, handoffs, and useful work Alex can perform immediately. A schedule calculation determines the dates.

### Optional IRB-style ethics perspective

The broader product can include an ethics-review persona that asks whether access matches Alex's duties, whether the documented use is permitted, and whether unnecessary participant information is exposed.

For this onboarding case, its useful output is an evidence-linked concern or a review question. A simulated opinion cannot establish actual approval. The central demonstration should be the consequences of unresolved requirements and task sequencing.

## 8. Version B: onboarding after the rehearsal

### October 5–7: prepare the complete packet

On day zero, Alex and Jordan review the extracted requirements. Jordan confirms HS-02 is outstanding. Alex completes the assumed two-hour component during a reserved block, uploads the evidence, and reviews the study's data-handling expectations.

Jordan checks the exact records against the local matrix, confirms the limited role, and obtains PI confirmation in the scheduled slot. The complete packet is submitted October 7.

Both versions begin on the same date and use the same initial two-day preparation window. The improved version does not hide two weeks of work before the modeled start. It explicitly assumes that the required work fits into those first two days with timely coordination.

### October 7–14: review and preparation overlap

The complete submission undergoes the same five-working-day review.

Meanwhile, Sam prepares the empty environment. That three-day branch finishes October 12. Alex can practice the notebook with fabricated records while real study data remains unavailable.

The product displays two concurrent lanes: environment ready and study-data authorization pending.

### October 14–16: complete the release checks

The review decision is recorded October 14. The data steward completes the same two-day checks, orientation, and role-record confirmation used in the baseline.

### October 16–19: activate and verify

Both prerequisite branches are complete. Sam performs the same one-day production activation and access test.

**Alex becomes ready on October 19. Four weeks remain in the rotation.**

## 9. The exact two-week comparison

| Stage | Original sequence | Prepared sequence | Reason for the change |
|---|---|---|---|
| Initial preparation | Oct 5 → Oct 7 | Oct 5 → Oct 7 | Same window; exact requirements verified earlier |
| Incomplete-packet screening | Oct 7 → Oct 12 | Avoided in this scenario | Complete evidence supplied initially |
| Correction and resubmission | Oct 12 → Oct 16 | Avoided as a later cycle | Work coordinated within initial preparation |
| Complete-packet review | Oct 16 → Oct 23 | Oct 7 → Oct 14 | Same five-day duration |
| Local release checks | Oct 23 → Oct 27 | Oct 14 → Oct 16 | Same two-day duration |
| Empty-environment preparation | Oct 27 → Oct 30 | Oct 7 → Oct 12 | Same three days, now in parallel |
| Final activation and test | Oct 30 → Nov 2 | Oct 16 → Oct 19 | Same one-day duration |
| **Ready for assigned data task** | **Nov 2** | **Oct 19** | **14 calendar days earlier** |

### Arithmetic without double-counting

```text
Original elapsed working days:
  2 preparation
+ 3 incomplete-packet screening
+ 4 correction and resubmission
+ 5 complete-packet review
+ 2 local release checks
+ 3 empty-environment preparation
+ 1 final activation
= 20 working days

Prepared elapsed working days:
  2 complete preparation
+ max(5 review + 2 local checks, 3 environment preparation)
+ 1 final activation
= 2 + max(7, 3) + 1
= 10 working days

Difference = 10 working days
November 2 minus October 19 = 14 calendar days
```

The three environment-preparation days still happen. They stop extending the end date because they fit inside the seven-day review-and-release interval.

| Intervention | Working days recovered in this fixture |
|---|---:|
| Catch the packet issue before the first submission | 7 |
| Prepare the empty environment in parallel | 3 |
| **Combined gain** | **10** |

The complete-packet review takes five days in both paths. The gain comes from readiness and sequencing.

## 10. Why two weeks matters to this student

The rotation has 30 modeled working days. Readiness at working-day boundary 20 leaves 10 working days for the assigned data task. Readiness at boundary 10 leaves 20.

At 12 scheduled research hours per week:

| Measure | Original | Prepared |
|---|---:|---:|
| Weeks remaining after readiness | 2 | 4 |
| Scheduled hours remaining after readiness | 24 | 48 |
| Additional opportunity for authorized data work | — | 24 hours |

The remaining opportunity for the primary assignment doubles in this fictional rotation. This does not establish that output doubles or that earlier time was wasted; Alex can learn methods and practice with fabricated data in both paths.

The extra time could permit an initial quality report, mentor feedback, revisions, and a documented handoff. The original plan might allow only an initial attempt and limited revision. These are plausible downstream possibilities, not modeled scientific results.

**Optional financial illustration:** At an invented rate of $25 per hour, the 24 additional hours available for the primary task represent $600 of scheduled student time. This is an allocation-of-time illustration, not a $600 payroll saving, recovered grant money, or verified economic benefit. The student may be paid and doing useful preparation in both versions.

## 11. Why use a simulation instead of just a checklist?

A checklist could identify missing training and suggest earlier preparation. That is valuable and is an appropriate baseline against which to evaluate the product.

The simulation adds a linked calculation: **when a requirement changes, which tasks move, which can proceed, and when does the student become ready?** It compares alternative plans with assumptions visible.

Each task should carry:

- A unique ID, description, and responsible person or office.
- A source establishing the requirement or permitted action.
- Evidence status: unknown, supplied, verified, or completed.
- Prerequisite task IDs.
- Elapsed working-day duration and its basis: supplied estimate, observed history, or demo assumption.
- Calendar availability and resource constraints.
- Whether it can occur before study-data authorization.
- The evidence required to confirm real completion.

For an ordinary task:

```text
earliest_start(task) = latest finish among its prerequisites
earliest_finish(task) = earliest_start(task) + working-day duration
```

A working implementation must also respect calendars and owner availability. This simplified fixture assumes availability and incorporates elapsed queues in the stated durations.

Final activation depends on both branches: authorization and environment readiness. Forecast dates remain separate from actual decision records.

Language models can interpret documents, propose dependency links, and explain discrepancies. Confirmed task data drives the scheduling calculation. This is a conditional what-if comparison; it does not require invented probabilities or a prediction of how real IRB members will vote.

## 12. Cases where the answer changes

The demo should not always return the same impressive number.

| Changed assumption | Original duration | Prepared duration | Gain | Meaning |
|---|---:|---:|---:|---|
| Main case | 20 working days | 10 working days | 10 days | Both interventions help |
| Packet was actually complete initially | 13 | 10 | 3 days | Only parallel preparation helps |
| Early environment preparation is prohibited | 20 | 13 | 7 days | Only submission preflight helps |
| Packet complete; early preparation prohibited | 13 | 13 | 0 days | These interventions add no timing benefit |
| Complete review takes 10 days in both paths | 25 | 15 | 10 days | Readiness moves later; avoidable sequence still differs |
| Review system closed until working-day boundary 15 | 26 | 23 | 3 days | Fixed reopening absorbs earlier-submission advantage |

In the outage variant, both complete packets are ready before the same reopening date. Both then need five days of review and two days of local checks. The baseline adds three days of late environment preparation; the improved plan has completed it already. Only those three days are recovered.

That variant models institutional-system uncertainty with a fictional calculation. Foresight cannot remove an external shutdown simply by describing it.

If processing times are unknown, offer named scenarios such as “review takes 5 days” and “review takes 10 days.” Probability distributions require a separate evidentiary basis. Arbitrary ranges should not be labeled confidence intervals.

## 13. Website demonstration: five screens

### Screen 1 — My starting point

> **Alex · Student researcher · Onboarding**<br>
> Joining REST-101 for supervised data-quality work.<br>
> Rotation: Oct 5–Nov 16. Availability: 12 hours/week.<br>
> Desired milestone: first authorized data task.

The profile establishes the user's actual stage and makes the goal concrete.

### Screen 2 — Evidence and readiness

| Requirement | Evidence | Starting status |
|---|---|---|
| Training HS-02 | No matching record supplied | Needs verification |
| Role description | Draft attached | Needs coordinator confirmation |
| PI confirmation | Not yet recorded | Pending |
| Empty-environment sponsorship | Can be arranged during preparation | Available next action |
| Production authorization | No completed decision or release record | Pending |

Each finding links to its fictional source. A human can correct the extraction before running the scenario.

### Screen 3 — Simulate the current plan

Show the returned-packet branch and late technical preparation as configured scenario assumptions, not certain future events.

> **Scenario readiness: November 2**<br>
> 20 working days from onboarding start.<br>
> Inspect unresolved training evidence and technical preparation scheduled after release.

### Screen 4 — Compare the prepared plan

Enable two interventions: resolve the evidence before submission, and prepare the empty environment during review.

> **Scenario readiness: October 19**<br>
> 10 working days from onboarding start.<br>
> **14 calendar days earlier under these assumptions.**

Show the same five-day review bar in both plans so the source of the gain is immediately clear.

### Screen 5 — Export the next actions

| Action | Owner | Prepared-plan target | Completion evidence |
|---|---|---|---|
| Resolve HS-02 | Alex and Jordan | Before Oct 7 submission | Verified training record |
| Confirm role and scope | Jordan and Dr. Chen | Before Oct 7 submission | Confirmed role description |
| Submit complete packet | Jordan | Oct 7 | Submission receipt |
| Request empty-environment preparation | Jordan and Sam | Oct 7 | Accepted, appropriately scoped request |
| Finish fabricated-data test | Sam and Alex | Oct 12 | Recorded test result |
| Finish local release checks | Data steward | Oct 16 | Release and role records |
| Activate and test production role | Sam and Alex | Oct 19 | Successful scoped access test |

The export makes the scenario actionable. It does not itself submit amendments, contact colleagues, or grant permissions.

## 14. A fictional agent exchange

**Administration reviewer:** “The checklist says training is complete, but the records only establish that two files were received. HS-02 remains unresolved.”

**Alex:** “I thought sending my certificates meant I was done.”

**Onboarding coordinator:** “Let's verify that now. In this scenario, the missing component fits into your first preparation block, and Jordan can check it before submission.”

**Computing reviewer:** “The empty environment can also be prepared before production data access is allowed.”

**Alex:** “So I can test the notebook while the personnel submission is being reviewed?”

**Computing reviewer:** “Yes, using the fabricated-data environment permitted by this scenario's policy. Study data remains behind the release gate.”

**Scheduler:** “These changes move readiness from November 2 to October 19. Seven working days come from avoiding the return-and-resubmission cycle; three come from overlapping technical preparation.”

**Alex:** “That gives me four weeks for the assignment instead of two.”

This dialogue is invented. Generated explanations should remain distinguishable from actual institutional messages.

## 15. Pitch material

### Thirty-second pitch

> “Our starting point was a familiar research experience: you've sent your documents, but you still don't know when you can begin. Trial Researcher rehearses onboarding using your role, study requirements, and the tasks behind access. In our fictional demo, a student waits four weeks because of a returned packet and technical setup started too late. Catching the missing requirement and preparing the empty workspace during review makes them ready two weeks earlier, with the same review duration. They can see exactly which actions change the timeline.”

### Product sentence

> **“Trial Researcher lets research teams rehearse their next steps, see what could delay them, and prepare the work that can happen now.”**

For Track 2, connect the example to an existing trial team: bringing an analyst, coordinator, or site staff member into an authorized role is part of study operations. This is one narrow operational workflow. Claims about trial launch, enrollment, amendments, monitoring, or clinical outcomes need their own models and evidence.

## 16. What a hackathon demo should establish

1. The system distinguishes a received document from evidence matching a requirement.
2. Findings point to supplied source passages.
3. Empty-environment preparation moves earlier only when the policy allows it.
4. The schedule reproduces 20 and 10 working days under the declared calendar.
5. Changing assumptions changes the gain to 3, 7, or 0 days where appropriate.
6. Production activation never precedes its prerequisites.
7. The output identifies a next action, owner, dependency, and completion evidence.

Those checks establish coherent demonstration behavior. Real-world value would require prospective onboarding cases, coordinator review of inferred requirements, and comparison against ordinary checklists or existing workflows. The two-week result here is illustrative.

## 17. Jargon for a new collaborator or AI

| Term | Meaning in this case |
|---|---|
| IRB | Institutional Review Board; its actual decisions are external to the simulation |
| PI | Principal investigator responsible for the study and role assignment |
| Personnel modification | The fictional institution's process for adding Alex to the existing team |
| Intake or screening | Initial examination for completeness and administrative issues |
| Deficiency notice | Request to supply or correct information; not automatically rejection of the research |
| Human-subjects training | Role-appropriate training under the applicable rules |
| RCR | Responsible Conduct of Research; not automatically interchangeable with every human-subjects requirement |
| SOP | Standard operating procedure describing a repeatable process |
| Role or delegation record | Documentation of assigned responsibilities |
| Local release check | The invented study's confirmation before data access is enabled |
| Provisioning | Preparing an account, environment, or role; preparation and activation are distinct here |
| MFA | Multifactor authentication |
| Coded records | Records labeled with participant codes; access restrictions still depend on applicable conditions |
| Fabricated-data environment | Workspace with entirely invented records for practice |
| Dependency | A prerequisite relationship between tasks |
| Parallel work | Tasks progressing during the same interval without waiting for one another |
| Critical path | The dependency chain determining earliest completion under the current assumptions |
| Elapsed time | Time between milestones, including waits and handoffs |
| Active effort | Time actually spent doing a task; it can be much shorter than elapsed time |
| Counterfactual | Comparison with a different plan while holding other assumptions fixed |
| Deterministic scenario | Calculation using specified values without probabilities |
| Readiness milestone | The point when Alex is authorized, technically enabled, and oriented for the assignment |
| Evidence provenance | Where a requirement or status came from, including source and date |

## 18. Handoff notes

This document is a proposed narrative, a specified scheduling example, and a demonstration blueprint. It does not establish that the current frontend implements agents, scheduling, source extraction, or access checks.

The central opportunity is to turn vague states such as “waiting for approval” into a source-linked dependency model, then let the user change a plan and see the consequences. The key editable assumptions are training-evidence status, permission for early technical preparation, review duration, and any fixed institutional reopening date.

Reviewers should challenge the dependency assumptions, identify where a checklist would suffice, and assess whether the simulation adds enough value to justify the scope. Preserve the fictional label and distinguish the constructed two-week outcome from measured results.
