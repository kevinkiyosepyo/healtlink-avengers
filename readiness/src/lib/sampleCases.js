import { analyzeDocuments, confirmRequirement } from "./readiness.js";

const document = (id, name, kind, text) => ({ id, name, kind, text });

/** Fresh fictional packets. Every timing and dependency is editable source data. */
export function createProject(kind = "rest") {
  const project = {
    id: kind === "empty" ? `project-${Date.now()}` : `sample-${kind}`,
    title:
      kind === "aurora"
        ? "AURORA-22 · Biospecimen readiness"
        : kind === "empty"
          ? "Untitled readiness project"
          : "REST-101 · Researcher readiness",
    studyId:
      kind === "aurora" ? "AURORA-22" : kind === "empty" ? "" : "REST-101",
    person:
      kind === "aurora"
        ? {
            name: "Jordan Rivera",
            role: "Biospecimen coordinator",
            institution: "Northlake Research Center",
          }
        : kind === "empty"
          ? { name: "", role: "", institution: "" }
          : {
              name: "Alex Chen",
              role: "Clinical research assistant",
              institution: "Westbridge University",
            },
    startDate: kind === "aurora" ? "2026-10-12" : "2026-10-05",
    targetDate: kind === "aurora" ? "2026-11-02" : "2026-10-19",
    documents: [],
    requirements: [],
    tasks: [],
    policies: [],
    scenarios: [
      {
        id: "baseline",
        name: "Current plan",
        description: "Source-defined sequence with current human verification.",
        taskDelays: {},
        assumedRequirementIds: [],
        dependencyOverrides: {},
      },
    ],
    activeScenarioId: "baseline",
    audit: [],
  };
  if (kind === "empty") return { ...project, startDate: "", targetDate: "" };
  if (!["rest", "aurora"].includes(kind))
    throw new Error(`Unknown sample project: ${kind}`);
  project.documents =
    kind === "rest"
      ? [
          document(
            "rest-requirements",
            "REST-101 site onboarding requirements.txt",
            "protocol",
            `Fictional demonstration packet — REST-101, Westbridge University.\nRequirement | id=gcp | title=General Good Clinical Practice | code=GCP-GENERAL | kind=training | owner=Alex Chen | state=verified\nRequirement | id=rest-course | title=REST-101 protocol-specific training | code=REST-101-TRAINING | kind=training | owner=Alex Chen | state=verified\nRequirement | id=site-forms | title=Study role and delegation paperwork | code=REST-FORMS | kind=document | owner=Study coordinator | state=received\nRequirement | id=account-request | title=Research-system account request | code=REST-ACCOUNT-REQUEST | kind=document | owner=IT service desk | state=received\nRequirement | id=authorization | title=PI authorization for REST-101 duties | code=REST-PI-AUTHORIZATION | kind=approval | owner=Principal investigator | state=approved\nRequirement | id=system-access | title=Active REST-101 system access | code=REST-SYSTEM-ACCESS | kind=access | owner=IT service desk | state=active`,
          ),
          document(
            "rest-workflow",
            "REST-101 processing times and sequence.txt",
            "workflow",
            `Fictional site operating assumptions; durations are working days, not service guarantees.\nTask | id=complete-training | title=Complete REST-101 training | owner=Alex Chen | days=4 | after= | requires=rest-course | completes=rest-course | state=received\nTask | id=verify-training | title=Verify protocol training evidence | owner=Study coordinator | days=1 | after=complete-training | requires=rest-course | completes=rest-course | state=verified\nTask | id=prepare-site | title=Prepare site delegation paperwork | owner=Study coordinator | days=5 | after=verify-training | requires=site-forms | completes=site-forms | state=received | preparation=true\nTask | id=prepare-it | title=Prepare the account request | owner=IT service desk | days=5 | after=prepare-site | requires=account-request | completes=account-request | state=received | preparation=true\nTask | id=approve-role | title=Approve the researcher’s study role | owner=Principal investigator | days=2 | after=verify-training,prepare-site,prepare-it | requires=authorization | completes=authorization | state=approved\nTask | id=activate-access | title=Activate and verify study-system access | owner=IT service desk | days=3 | after=approve-role | requires=system-access | completes=system-access | state=active`,
          ),
          document(
            "rest-policy",
            "REST-101 parallel preparation policy.txt",
            "policy",
            `Policy | id=rest-parallel | title=Prepare forms and account request while training is pending | parallel=prepare-site,prepare-it | description=The coordinator may prepare delegation paperwork and IT may prepare the account request in parallel with training. PI authorization still requires verified REST-101 training and both completed preparations. Access activation still requires PI approval.\nThis policy authorizes preparation only; receiving a certificate does not verify training, approve a study role, or activate access.`,
          ),
          document(
            "rest-gcp-certificate",
            "Alex Chen — general GCP certificate.txt",
            "evidence",
            `Fictional certificate — sample evidence only.\nEvidence | code=GCP-GENERAL | state=received | title=Alex Chen completed General Good Clinical Practice | date=2026-09-18\nCourse covered: general Good Clinical Practice. This certificate does not cover REST-101 protocol-specific training.`,
          ),
        ]
      : [
          document(
            "aurora-requirements",
            "AURORA-22 biospecimen team requirements.txt",
            "protocol",
            `Fictional demonstration packet — AURORA-22, Northlake Research Center.\nRequirement | id=appointment | title=Institutional research appointment | code=AURORA-APPOINTMENT | kind=document | owner=Jordan Rivera | state=verified\nRequirement | id=biosafety | title=Laboratory biosafety orientation | code=LAB-BIOSAFETY | kind=training | owner=Jordan Rivera | state=verified\nRequirement | id=shipping | title=Category B specimen shipping certification | code=UN3373-SHIPPING | kind=training | owner=Jordan Rivera | state=verified\nRequirement | id=manifest | title=Specimen manifest and chain-of-custody templates | code=AURORA-MANIFEST | kind=document | owner=Lab coordinator | state=received\nRequirement | id=lab-approval | title=Laboratory director delegation approval | code=AURORA-LAB-APPROVAL | kind=approval | owner=Laboratory director | state=approved\nRequirement | id=lims | title=Active restricted LIMS workspace | code=AURORA-LIMS | kind=access | owner=Lab systems administrator | state=active`,
          ),
          document(
            "aurora-workflow",
            "AURORA-22 lab preparation sequence.txt",
            "workflow",
            `Fictional planning estimates; working days exclude weekends and do not include holidays.\nTask | id=verify-appointment | title=Verify institutional appointment | owner=Research office | days=2 | after= | requires=appointment | completes=appointment | state=verified\nTask | id=shipping-course | title=Complete Category B shipping course | owner=Jordan Rivera | days=6 | after=verify-appointment | requires=shipping | completes=shipping | state=received\nTask | id=verify-shipping | title=Verify shipping certification and scope | owner=Lab coordinator | days=2 | after=shipping-course | requires=shipping | completes=shipping | state=verified\nTask | id=prepare-manifest | title=Prepare manifest and custody templates | owner=Lab coordinator | days=5 | after=verify-shipping | requires=manifest | completes=manifest | state=received | preparation=true\nTask | id=approve-lab | title=Approve delegated specimen responsibilities | owner=Laboratory director | days=3 | after=verify-shipping,prepare-manifest | requires=lab-approval | completes=lab-approval | state=approved\nTask | id=activate-lims | title=Activate restricted LIMS workspace | owner=Lab systems administrator | days=2 | after=approve-lab | requires=lims | completes=lims | state=active`,
          ),
          document(
            "aurora-policy",
            "AURORA-22 template preparation policy.txt",
            "policy",
            `Policy | id=aurora-parallel | title=Prepare specimen templates during shipping training | parallel=prepare-manifest | description=The laboratory coordinator may prepare empty manifest and chain-of-custody templates while shipping training is pending. Specimen handling requires the laboratory director’s approval after verified shipping certification; restricted LIMS activation follows that approval.\nNo specimen handling or restricted-system access is authorized by template preparation.`,
          ),
          document(
            "aurora-records",
            "Jordan Rivera — appointment and orientation records.txt",
            "evidence",
            `Fictional records — sample evidence only.\nEvidence | code=AURORA-APPOINTMENT | state=received | title=Jordan Rivera institutional appointment letter | date=2026-09-28\nEvidence | code=LAB-BIOSAFETY | state=received | title=Laboratory biosafety orientation completion | date=2026-09-30\nBiosafety orientation does not include UN3373 specimen shipping certification.`,
          ),
        ];
  const extracted = analyzeDocuments(project.documents);
  Object.assign(project, {
    requirements: extracted.requirements,
    tasks: extracted.tasks,
    policies: extracted.policies,
  });
  project.scenarios.push({
    id: "parallel",
    name: "Parallel preparation",
    description:
      "Apply the source-backed preparation policy; retain every verification and approval gate.",
    taskDelays: {},
    assumedRequirementIds: [],
    dependencyOverrides: { ...project.policies[0].allowedOverrides },
  });
  let result = project;
  for (const id of kind === "rest" ? ["gcp"] : ["appointment", "biosafety"])
    result = confirmRequirement(
      result,
      id,
      "verified",
      "Fictional sample: coordinator checked the named evidence against this requirement.",
    );
  return result;
}
