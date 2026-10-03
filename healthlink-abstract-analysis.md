# JSHS abstracts mapped to the MedTech hackathon tracks

## Scope and reading rule

I reviewed the 232 student-paper abstracts in the 2023 [61st National JSHS abstract book](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md>) against the four tracks and example ideas in [the MedTech hackathon slides](</Users/kevinpoopz/Downloads/medtech-hackathon-slides.md>). “HealthLink-related” here means a plausible healthcare, medical-device, clinical-research, accessibility, public-health, or therapeutic connection. The line numbers below point to the start of each abstract in the source book. Track assignments and product ideas are my analysis; performance and impact claims belong to the student abstracts and have not been independently validated.

**Reading the fit labels:** **Direct** means the abstract already describes a tool, device, workflow, or model close to a slide example. **Enabling** means a research component that could support a track but is not itself a hackathon-ready clinical product. **Background** means a medically relevant research result with a longer path to a working prototype. A project can fit more than one track; it appears once under its strongest fit.

## What stands out

1. **The clearest hackathon starting points are bounded workflows:** X-ray quality control (2087), remote breath-sound capture (1450), urine-output logging (1084), fall-risk assessment (2812), and eye-drop delivery (3281). Each has a specific user, input, and action. Build a clinician- or caregiver-facing prototype with explicit human review.
2. **Track 1 is well represented.** It includes MRI, pathology, radiography, retinal, EEG, Doppler, voice, and cough approaches. The slide's “swarm” idea is an interface/coordination layer; none of the abstracts establishes that multiple agents improve diagnostic accuracy.
3. **Track 2 has a real gap.** Several papers improve assays, drug safety, or laboratory data extraction, but none directly builds trial setup, recruitment, monitoring, or site-risk software. An idea in this track would be a new synthesis, not a reproduction of an abstract.
4. **Track 3 has many computational leads but few patient-ready formulations.** OncoRx, GlucoseAssist, treatment-response simulation, and transplant sizing are the closest decision-support examples. Cell, animal, and simulation results should stay labeled as research leads.
5. **Reported accuracies are starting points, not clinical proof.** The abstracts often lack patient-level splits, prospective or external validation, calibration, failure analysis, and workflow testing. Some have very small samples (for example, acromegaly uses roughly 20 images; the non-invasive glucose system reports n=10). Avoid translating an abstract's accuracy directly into patient-facing claims.

## Track 1 — Swarm-Powered Diagnostics

| Source line | Abstract | Fit and HealthLink use | Main validation question |
| ---: | --- | --- | --- |
| [958](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:958>) | Early Detection of Acromegaly Using a Novel Convolutional Neural Network | **Direct.** Facial-image screening could be a second-read flag. | Roughly 20 images; test on independent patients and sites. |
| [942](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:942>) | VAST: voice and spiral screening for Parkinson’s | **Direct.** A multimodal voice-and-drawing review flow resembles an agent-assisted diagnostic intake. | Verify subject-level splits, disease controls, and severity labels. |
| [1000](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1000>) | Tuberculosis cough analysis | **Direct.** Smartphone cough triage plus treatment-trend review. | Verify labels, recording-device and country generalization; the abstract’s treatment-monitoring AUC wording needs clarification. |
| [1060](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1060>) | Doppler-based ankle-brachial-index prediction | **Direct.** Point-of-care vascular screening from Doppler signal. | Validate across calcified vessels and different operators/devices. |
| [1439](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1439>) | StrokeSight EEG stroke assessment | **Direct.** Rapid EEG triage with interpretable spectral maps. | A 132-recording dataset is small for stroke type, location, and severity claims; external validation is essential. |
| [1450](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1450>) | BOREAS remote breath-sound capture | **Direct.** A telehealth capture-and-review pipeline with audio-quality checks. | Test on patients, consumer microphones, background noise, and clinician interpretation. |
| [1654](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1654>) | CNNs for fundus and eyelid disease | **Direct.** Image triage across multiple eye conditions. | Evaluate each disease on external images and report sensitivity at a useful referral threshold. |
| [1995](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1995>) | Intraoperative squamous-cell-carcinoma margin analysis | **Direct.** Pathology second read during Mohs surgery; closest to “Pathology AI.” | The abstract reports 95 whole-slide images; test independent slides and timing in the actual workflow. |
| [2087](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2087>) | WriVision wrist X-ray quality control | **Direct.** Alert technologists to acquisition problems before a patient leaves; a strong bounded prototype. | Validate on other scanners, patient groups, hardware, and positioning protocols. |
| [2299](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2299>) | AI plus GIS analysis for lung-cancer imaging | **Direct.** Combine lesion detection with spatial context. | The abstract reports 80% accuracy after GIS; evaluate independent cases and clinically meaningful error costs. |
| [2688](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2688>) | Brain-tumor MRI transfer learning | **Direct.** MRI classifier that can flag a case for review. | Verify patient-level separation, institutions, scanners, and tumor-class performance. |
| [3506](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:3506>) | Super-resolution for low-field MRI | **Direct.** Improve image quality before a radiologist or model reviews a scan. | Test real low-field scans and whether diagnostic decisions improve, beyond synthetic-image scores. |
| [2239](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2239>) | Non-invasive glucose sensor with neural network | **Direct, cross-track.** A sensor-plus-model monitoring concept. | The reported human sample is n=10; test independent users and clinically relevant ranges. |
| [2033](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2033>) | Imaging perivascular spaces after brain stimulation | **Enabling.** Quantitative neuroimage analysis, relevant to an imaging pipeline. | Show a defined clinical decision and validation set. |
| [3249](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:3249>) | Polymer-based protease detection | **Enabling.** Potential assay input for a diagnostic workflow. | Demonstrate disease specificity and practical sample handling. |

**Prototype direction:** A diagnostic worklist that checks input quality, runs a narrow model, shows evidence and uncertainty, and asks a clinician to confirm. WriVision is the safest example because it addresses image acquisition quality rather than declaring a diagnosis. For the slide’s MRI or pathology examples, use one narrowly defined task and audit false negatives; “multi-agent” should be justified by a measurable workflow benefit.

## Track 2 — AI-Powered Clinical Trials

The source book has **no direct equivalent** of Trial-in-a-Box or Site Risk Sentinel. The nearest enabling papers are below.

| Source line | Abstract | Possible trial connection | Missing for a trial product |
| ---: | --- | --- | --- |
| [1119](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1119>) | Microfluidic liver chip for drug-induced liver injury | Preclinical safety evidence and assay tracking. | Trial protocol, human outcomes, and site data. |
| [2483](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2483>) | Cellori RNA-FISH spot detection | Standardized biomarker image extraction. | Site-to-site quality controls and clinical endpoint validation. |
| [2734](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2734>) | Prefilled syringe testing of hospital drugs | Test records and batch release workflow; strong documentation inspiration. | Trial operations, enrollment, and monitoring. |
| [2891](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2891>) | qPCR quantification of CAR-T cells | Candidate assay for treatment monitoring. | Prospective patient monitoring workflow and endpoint rules. |
| [3078](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:3078>) | AI-predicted anti-cancer peptides with in-vitro validation | Discovery-to-assay handoff and evidence provenance. | Human safety and trial design. |
| [3517](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:3517>) | TaxHorn microbiome distance metric | Potential exploratory biomarker or safety signal. | Clinical meaning and prospective validation. |

**Prototype direction:** Build a small trial-data intake and anomaly queue: upload a synthetic study protocol, sample assay CSVs, and a visit schedule; identify missing visits, out-of-range values, protocol deviations, and site-level patterns; attach a source trail and human disposition. That workflow is supported by the slide brief, but its specific methods are not established by these abstracts.

## Track 3 — Personalized Medicine

| Source line | Abstract | Fit and HealthLink use | Main validation question |
| ---: | --- | --- | --- |
| [902](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:902>) | GlucoseAssist | **Direct.** Personalized 30-minute glucose forecasts from CGM, food, health, and medication inputs. | Verify person-level holdout, calibration, and whether a warning changes outcomes. |
| [1499](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1499>) | MicroRNA-488 as a type-2-diabetes biomarker | **Enabling.** Candidate biomarker for risk stratification. | Replication and added value over standard clinical measures. |
| [1715](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1715>) | Pancreatic-cancer driver genes via ML | **Enabling.** Biomarker prioritization for future targeted care. | Biological and clinical validation of proposed genes. |
| [2801](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2801>) | OncoRx miRNA biomarkers and drug combinations | **Direct in concept.** Closest to a treatment-matching recommendation tool. | The abstract reports retrospective computational validation; test treatment response and clinician review before therapeutic use. |
| [2833](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2833>) | ML-guided AAV vector design | **Enabling.** Tailored gene-therapy platform research. | Tissue targeting, manufacturing, and safety. |
| [2867](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2867>) | Demographic prediction of donor-organ volumes | **Direct.** Donor–recipient lung-size matching support when CT is absent. | Quantify transplant decisions and error by demographic group; reported R² is moderate. |
| [2878](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2878>) | Lung-cancer recurrence/survival prediction | **Direct.** Personalized follow-up planning after surgery. | External survival calibration and decision benefit; reported AUC is 0.75–0.77. |
| [2937](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2937>) | CAPCODRE cognitive-disorder risk app | **Direct in concept.** Personalized environmental and history-based risk display. | Individual-level outcomes, fairness, and whether geographic proxies distort risk. |
| [3154](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:3154>) | ML prediction of immunotherapy effect in simulated tumors | **Enabling.** Fast surrogate for a cell simulation. | Simulated-cell response is not observed patient response. |
| [3355](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:3355>) | IL-6/IL-8 prediction in sickle-cell anemia | **Enabling.** Candidate patient-specific inflammatory marker model. | Small cohort; replicate prospectively and assess clinical actionability. |
| [3530](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:3530>) | Pharmacophore/deep-learning cancer drug combinations | **Enabling.** Research lead for combination choice. | Experimental synergy, toxicity, dose, and human response. |
| [2755](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2755>) | Shared SNPs across seven cancers | **Enabling.** Potential cross-cancer biomarkers. | Independent population replication and clinical utility. |
| [2617](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2617>) | Small-molecule targeting of RNA structures | **Enabling.** Drug design for specific targets. | Target engagement and therapeutic effect. |
| [3281](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:3281>) | Eye-drop dispenser precision | **Direct, cross-track.** Dose-delivery reliability rather than drug choice. | Human usability, delivered dose, and safety. |

**Prototype direction:** A pharmacist or clinician review workspace can collect patient inputs, surface relevant constraints and source evidence, flag uncertain or conflicting recommendations, and record approval. It should present the computational papers as leads, not as validated prescribing rules. The slides’ FormulaMatch/DoseCheck workflow is more immediately buildable than recreating a new drug formulation in a hackathon.

## Track 4 — Open Innovation in MedTech

| Source line | Abstract | Fit and HealthLink use | Main validation question |
| ---: | --- | --- | --- |
| [969](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:969>) | Real-time sign-language detector | **Direct.** Communication access in care encounters. | Signing diversity, dialects, lighting, and user testing. |
| [1012](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1012>) | Low-cost mask-droplet metrology | **Direct for lab operations.** An instrument/analysis workflow for mask evaluation. | Correlation with standardized tests and reproducibility. |
| [1033](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1033>) | Sprayable antimicrobial hydrogel dressing | **Direct device/material concept.** A wound-care prototype. | Biocompatibility, sterility, release profile, and wound healing. |
| [1084](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1084>) | Connected Foley urine-output measurement | **Direct.** Clear LabFlow-style measurement and dashboard idea. | Bedside calibration, bag movement, network outages, and clinical workflow. |
| [1095](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1095>) | Bilayer hydrogel for atopic dermatitis | **Direct material concept.** Protective skin barrier. | Skin safety, wear time, and comparison with standard care. |
| [1358](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1358>) | VR prosthetic training environment | **Direct.** Home or clinic rehabilitation simulation. | Whether realistic physics improves training outcomes. |
| [1373](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1373>) | iPhone haptic refreshable Braille | **Direct.** Lower-cost accessibility tool. | Blind-user testing and reading speed in daily use. |
| [1416](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1416>) | Four-electrode yes/no brain-computer interface | **Direct.** Communication aid for non-verbal patients. | Real patient performance, setup burden, and errors in urgent communication. |
| [1575](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1575>) | Duodenoscope biofilm reprocessing | **Direct hospital-operations problem.** Instrument infection-control workflow. | Real-world cleaning efficacy and material compatibility. |
| [1844](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1844>) | Turmeric bandage | **Direct material concept.** Wound dressing. | Controlled comparison, infection safety, and healing outcomes. |
| [1928](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1928>) | Liver preservation approach | **Enabling.** Transplant transport/logistics problem. | Organ and patient outcomes after preservation. |
| [1939](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1939>) | Form-correcting weightlifting device | **Direct wellness/rehab-adjacent.** Wearable coaching. | Injury or movement outcomes in intended users. |
| [2102](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2102>) | Transcranial focused-ultrasound simulation | **Enabling device software.** Treatment planning/optimization. | Physical phantom and clinical validation. |
| [2228](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2228>) | Infection-monitoring antimicrobial wound dressing | **Direct.** Sensor plus dressing; closest to HemoTape’s wearable-monitoring direction. | Sensor specificity, biocompatibility, and usability on real wounds. |
| [2350](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2350>) | Gaze estimation for disabled communication | **Direct.** Accessible gaze-to-message interface. | Robustness across head motion and real users. |
| [2410](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2410>) | IoT alert system for aged, blind, and disabled users | **Direct.** Caregiver alert/escalation prototype. | Reliability, false alarms, accessibility, and offline behavior. |
| [2791](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2791>) | Dynamic filtering for color-vision deficiency | **Direct.** Assistive visual device. | Benefit across users and everyday visual tasks. |
| [2812](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2812>) | SAFE fall-risk sensor fusion | **Direct.** Home or clinic assessment with clinician review. | Prospective falls, subgroup performance, and alert usefulness. |
| [2856](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2856>) | Electroactive cellulose bandage | **Direct material concept.** Antimicrobial wound care. | Human safety and wound outcomes. |
| [3318](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:3318>) | RevealED eating-disorder content detection | **Direct public-health tool.** Moderation/research signal. | The abstract labels images by hashtag; verify ground truth and assess false positives and harm. |
| [3415](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:3415>) | EEG-controlled robotic arm | **Enabling assistive prototype.** Accessibility/control interface. | Reliable control by intended users. |
| [1961](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1961>) | mmWave vital-sign biometric authentication | **Enabling peripheral technology.** Contactless sensing could be repurposed, though the paper’s goal is identity. | Establish a clinical use and validate physiological measures. |

**Prototype direction:** The most practical weekend builds are a urine-output dashboard with simulated sensor input, a remote breath-sound capture and quality workflow, a caregiver alert escalation flow, or a device-quality/usage tracker. The wound materials and therapeutic devices are compelling research, but a software demonstration cannot establish safety or effectiveness.

## Other medically related abstracts: research leads and lower-fit ideas

These are relevant to healthcare but do not directly implement the slide examples. Their one-line analysis explains the most plausible bridge or why the fit is distant. Line numbers again refer to the abstract book.

| Line | Abstract | Assessment |
| ---: | --- | --- |
| [799](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:799>) | Glioblastoma oncogenic signatures | Molecular recurrence research; could inform future biomarker selection. |
| [880](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:880>) | Hypothalamic EZH2 and leptin sensitivity | Obesity mechanism; distant from a deployable patient tool. |
| [918](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:918>) | Hindbrain activation after intestinal lipid infusion | Animal physiology for appetite/diabetes research. |
| [980](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:980>) | Punicalagin and chemotherapy hepatotoxicity | Cell-study treatment-safety lead; not a validated protective formulation. |
| [1106](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1106>) | Hepatitis B interferon resistance model | In-vitro response biology; candidate stratification research. |
| [1132](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1132>) | Claramine–atorvastatin nanoparticles for plaque | Simulated targeted delivery concept; long translation path. |
| [1143](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1143>) | Dual-function ischemic-stroke therapeutic | Molecular treatment design; would require extensive safety testing. |
| [1154](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1154>) | Sweeteners and hunger perception in fruit flies | Nutrition/behavior mechanism, not a clinical product. |
| [1309](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1309>) | Disulfide polymer nanomedicine carriers | Drug-delivery materials platform; supports future formulations. |
| [1346](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1346>) | Phytochemical quorum quenching | Antimicrobial discovery; exploratory lab evidence. |
| [1394](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1394>) | Bacteriophage capsule depolymerases | Antimicrobial research; possible future precision infection therapy. |
| [1405](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1405>) | Shared functions of autism-linked genes | Basic genetic insight, not a diagnostic assay. |
| [1462](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1462>) | COVID-19 case forecasting with mobility data | Public-health forecasting, useful for population operations rather than patient care. |
| [1536](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1536>) | ʻAwapuhi mechanisms in neuroblastoma | Natural-product oncology research; preclinical. |
| [1606](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1606>) | Lactobacillus inhibitors for Candida | Probiotic/antifungal research in an infection model; preclinical. |
| [1620](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1620>) | Embryoid-body development model | Stem-cell platform work; indirect healthcare relevance. |
| [1679](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1679>) | EEG cognitive-engagement identification | Safety monitoring concept; clinical purpose not yet established. |
| [1738](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1738>) | Purification of the MED1 receptor interaction domain | Diabetes-drug mechanism research that could eventually inform safer compounds. |
| [1775](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1775>) | Metabolic inhibitors in zebrafish liver cancer | Preclinical target discovery. |
| [1794](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1794>) | Public-health messaging and racial bias | Behavioral intervention design; relevant to patient communication campaigns. |
| [1833](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1833>) | Fat preference of triple-negative breast-cancer cells | Nutrition/cancer mechanism; no patient diet recommendation follows. |
| [1868](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1868>) | Palmitoylation of hepatic drug transporters | Mechanism for future drug-response prediction. |
| [1879](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:1879>) | Estrogen receptor alpha and fatty liver disease | Disease-mechanism work; possible future stratification marker. |
| [2007](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2007>) | CaSR–GSH antagonist research | Early cancer-therapeutic target investigation. |
| [2064](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2064>) | Monoclonal antibody control of lyssavirus in vivo | Infectious-disease therapeutic research; preclinical. |
| [2113](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2113>) | COVID-19 patient gut microbiome | Observational microbiome findings; possible future biomarker work. |
| [2126](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2126>) | Blood–brain-barrier dysfunction after TBI | Mechanistic injury comparison; future imaging/biomarker input. |
| [2137](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2137>) | MNRR1 inhibition in breast cancer | Target discovery; preclinical. |
| [2150](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2150>) | Memantine-induced sleep in Alzheimer’s fruit-fly model | Animal-model treatment hypothesis, not clinical evidence. |
| [2172](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2172>) | Mpox resurgence biocomputation | Public-health genomics, farther from the four prototype examples. |
| [2206](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2206>) | Broccoli-sprout nanovesicles for IBD | Targeted-delivery research; early-stage formulation concept. |
| [2217](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2217>) | Microplastics and neuroinflammation in obesity | Exposure/disease mechanism; public-health relevance. |
| [2271](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2271>) | Cell-type pathways in multiple sclerosis | Biomarker/therapeutic-target research. |
| [2287](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2287>) | Antioxidants for PTSD in C. elegans | Worm-model prevention hypothesis; no patient treatment claim. |
| [2339](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2339>) | ML prediction of viral zoonoses | Surveillance tool for outbreak prevention, not individual diagnosis. |
| [2453](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2453>) | Luteolin/resveratrol-derived compound with doxorubicin | Experimental oncology combination; safety and efficacy unknown in patients. |
| [2470](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2470>) | SPTBN1 knockout and liver-cancer metabolism | Molecular mechanism/target research. |
| [2507](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2507>) | COVID-related cardiomyopathy transcriptomics | Molecular pathways; could guide future biomarker work. |
| [2540](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2540>) | Synaptic boutons in human visual cortex | Foundational neuroscience, distant product fit. |
| [2579](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2579>) | ER–mitochondria interactions | Foundational cell biology, distant product fit. |
| [2591](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2591>) | Perceived bias and racial trauma | Mental-health survey research; care-design implications require replication. |
| [2645](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2645>) | Transgenerational stress in C. elegans | Basic behavioral/genetic research. |
| [2678](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2678>) | Mouse fear-response experimental system | Neuroscience research apparatus, not a care tool. |
| [2710](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2710>) | Grin2a network in addiction | Candidate molecular target; preclinical. |
| [2721](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2721>) | CSPG4 in pancreatic-cancer invasion | Immunotherapy-target research; preclinical. |
| [2745](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2745>) | FLT3 inhibitors for resistant leukemia | Drug discovery, not patient-specific prescribing. |
| [2924](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2924>) | siRNA in abdominal aortic aneurysm | Therapeutic-delivery research; preclinical. |
| [2983](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:2983>) | Mental health and performance in teen athletes | Health-behavior insight; possible screening/coaching idea, but observational. |
| [3130](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:3130>) | Silver nanoparticles and lung-cell toxicity | Device/material safety evidence, not a patient product. |
| [3177](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:3177>) | 8D-music perception using mobile EEG | Possible therapy research; treatment effect not established. |
| [3225](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:3225>) | Piperine in melanoma cells | In-vitro anti-cancer lead. |
| [3270](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:3270>) | Luteolin in a fruit-fly AMD model | Preclinical supplement hypothesis. |
| [3295](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:3295>) | Thymoquinone and prostate-cancer cells | In-vitro therapeutic lead. |
| [3308](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:3308>) | ML morphological classification of neurons | Research image analysis; clinical application unclear. |
| [3329](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:3329>) | Isolation of bacteria from probiotic foods | Early microbiome/food-science research. |
| [3369](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:3369>) | Acetyl-CoA synthesis and T-cell exhaustion | Immunotherapy mechanism work. |
| [3471](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:3471>) | Xenorhabdus antibiotic discovery | Preclinical antimicrobial discovery. |
| [3482](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:3482>) | NK-cell profiles in liver cancer | Immune-state biomarker/target research. |
| [3541](</Users/kevinpoopz/Desktop/Law is law/61st-National-JSHS-Abstract-Book.md:3541>) | SARS-CoV-2 genomic evolution | Public-health surveillance research. |

## Best choices by available build time

| If the team has… | Build | Why | Keep the demo honest |
| --- | --- | --- | --- |
| Mostly software skills | **WriVision-inspired image-quality assistant** | Bounded decision, visible input/output, clear user action. | Show an acquisition-quality flag, not a diagnosis. |
| Audio and frontend skills | **BOREAS-inspired telehealth sound workflow** | Captures a missing signal and makes it reviewable. | Measure recording quality and clinician agreement. |
| Simple hardware access | **Foley output monitor** | Concrete sensor-to-dashboard loop and $35 prototype reported in the abstract. | Simulate clinical data until physical calibration is done. |
| Data and workflow skills | **Trial anomaly queue** | Fills the clearest gap in the book while matching Track 2. | Label it as a new prototype inspired by the track, not by a directly matching paper. |
| Clinical/pharmacy collaborator | **DoseCheck-style approval record** | Uses the slide’s explicit pharmacist-review workflow. | Limit to traceable safety flags and human approval. |

## Source and interpretation limits

The catalog is a 2023 abstract book, not full papers, device files, trial registries, or independent replications. The slides are a short hackathon brief, not a validation standard. I did not verify student-reported prevalence, accuracy, clinical impact, cost, or regulatory statements. Several abstracts contain wording or metrics that need clarification before reuse, including the tuberculosis monitoring AUC, the small sample behind the non-invasive glucose result, and apparent clinical conclusions drawn from computational or laboratory evidence. Before selecting a concept, obtain its full methods/data and define the end user, decision, failure mode, and evaluation measure.
