<!--
  Text and tables extracted from documents/inklutrack_proposal.docx on
  11 October 2026 (D-07). Figures and mock-ups are only in the .docx; if the
  .docx changes, extract it again rather than editing this copy.
-->
# INKLUTRACK: AI-ENABLED LIFECYCLE-BASED SMART APPLICATION FOR PWD PRODUCTIVITY DEVELOPMENT: FROM ENROLLMENT TO JOB PLACEMENT

A Capstone Project

Presented to

The Faculty of the College of Information and Computing Science

Zamboanga Peninsula Polytechnic State University

In Partial Fulfillment of the Requirements

For the Degree of Bachelor of Science in Information Technology

By

Basco, John Michael B.

Jalem, Christian Mathew B.

Macas, Eric T.

Salvador, John Paul T.

Aldeliene K. Tulawie, MEngg. Ed

Adviser

May 2026

## CHAPTER 1 — INTRODUCTION

### 1.1 BACKGROUND OF THE PROBLEM

The rapid advancement of information and communication technologies, particularly artificial intelligence (AI), has transformed service delivery across education, social services, and workforce development. AI-driven systems for prediction, personalization, and decision support are improving outcomes through structured data collection, analytics, and automated insights. Despite this progress, many rehabilitation and workforce-preparation programs for persons with disabilities (PWDs) still operate in fragmented environments where enrollment, assessment, training, and job placement are handled in silos. This disconnect leads to delayed interventions, incomplete visibility into client progress, and suboptimal employment outcomes.

International and local studies show that structured transition pathways and continuous support are essential to move PWDs from training to competitive employment. However, most available platforms emphasize single domains (e.g., case documentation or learning analytics) rather than providing end-to-end lifecycle tracking with AI-enabled insights. In AI, proven techniques such as recommender systems, risk prediction, and NLP-enabled notes analysis can streamline monitoring and personalize interventions—yet such capabilities are rarely integrated into a single, accessible system tailored to PWD rehabilitation contexts.

In the Philippine setting—specifically at the Area Vocational Rehabilitation Center (AVRC) Region IX—PWD clients undergo vocational and life-skills training, counseling, and job preparation. Staff report that manual or disjointed tooling makes it hard to consolidate records, monitor behavioral and productivity trends, and follow clients through internships and job placement. Without a centralized digital platform, staff spend time reconciling data instead of acting on insights; clients receive delayed feedback; and administrators lack timely, standardized reports that could inform decisions and partnerships with employers.

This proposal introduces InkluTrack, an AI-enabled lifecycle-based smart application that unifies enrollment, profiling, assessment, training and productivity monitoring, performance evaluation, job matching, and placement tracking. By integrating inclusive design, structured data flows, and AI-driven recommendations, InkluTrack aims to strengthen decision-making, accelerate interventions, and improve employment readiness and outcomes for PWDs served by AVRC Region IX.

### 1.2 PROJECT CONTEXT

InkluTrack is situated in AVRC Region IX’s operational environment as a centralized, role-based web application for counselors, trainers, administrators, and authorized client users. The system focuses on lifecycle continuity—linking intake and profiling, behavioral and skills assessment, training attendance and productivity metrics, evaluation and reporting, and employer-facing placement coordination—within one platform.

The project operates at the intersection of inclusive technology, evidence-based rehabilitation, and AI-supported workforce development. It aligns with the Magna Carta for Disabled Persons (RA 7277), the Philippine Data Privacy Act (RA 10173), and the UN Sustainable Development Goals (SDG 8: Decent Work and Economic Growth; SDG 10: Reduced Inequalities). Practically, InkluTrack operationalizes these mandates by digitizing key processes, enabling analytics, and promoting ethical, accessible design so that PWD clients receive timely, data-informed support from enrollment through job retention monitoring.

### 1.3 PURPOSE AND DESCRIPTION

The primary purpose of InkluTrack is to design and develop a functional, accessible, AI-enabled lifecycle monitoring application that empowers AVRC staff to track, analyze, and support PWD client development from intake to job placement. The system will centralize client data and lifecycle events from enrollment through assessment, training, and internship or placement, provide real-time dashboards and standardized reports for staff and administrators, use AI features for productivity risk prediction and job-matching recommendations based on client profiles, training performance, and documented competencies, and incorporate accessibility and usability principles such as clear navigation, high-contrast UI, and WCAG-informed components to accommodate varying digital literacy and abilities. The primary user groups include PWD clients with limited, read-only or assisted self-service views of progress and feedback as authorized, AVRC staff such as counselors and trainers who record assessments, interventions, and training data, AVRC administrators who manage users, workflows, partnerships, and reports, and employer partners with optional, restricted access for posting roles, confirming interviews, and logging outcomes.

The primary purpose of InkluMarket is to develop a functional, accessible, and AI-enabled mobile e-commerce application that bridges the gap between PWD livelihood training at AVRC Region IX and actual product commercialization in the digital marketplace. The system is designed to empower PWD trainees as active digital entrepreneurs by providing user-friendly tools to list, promote, and sell their products online, while also enabling AVRC staff to manage platform operations efficiently. InkluMarket is described as a smart application because it integrates artificial intelligence at its core through features such as an AI-based product recommendation engine and smart search functionality, enhancing product discoverability and user engagement to ensure that PWD-made products receive greater visibility among potential buyers. The system incorporates accessibility principles including simplified navigation, high-contrast visual design, and clear instructional cues to accommodate users with varying levels of digital literacy and physical ability. The application will serve three primary user groups: PWD trainees who will act as sellers and product creators; AVRC administrators who will manage platform operations, product listings, and user accounts; and general consumers who will browse, search, and purchase products from the marketplace. The system will be built using modern mobile development frameworks and will leverage open-source AI tools to ensure sustainability and scalability within the academic and institutional context.

### 1.4 OBJECTIVES

#### 1.4.1 GENERAL OBJECTIVES

Design and develop “InkluTrack: An AI-Enabled Lifecycle-Based Smart Application for PWD Productivity Development From Enrollment to Job Placement in AVRC Region IX” to serve as a centralized, accessible platform for end-to-end client monitoring, AI-informed decision support, and placement tracking that improves program efficiency and client employment outcomes.

#### 1.4.2 SPECIFIC OBJECTIVES

| **No.** | **Objective** | **Specific** | **Measurable** | **Achievable** | **Relevant** | **Time-bound** |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Design the system architecture and database | Create a detailed framework for the lifecycle monitoring platform covering UI/UX, API contracts, data schema/ERD, lifecycle stages, role-based access, and AI integration points | Approved architecture and design documents by advisers and AVRC stakeholders | Cross-functional workshops with advisors, engineers, and SMEs; use established patterns and ADRs to converge | Solid architecture is foundational for reliable delivery and future AI features | August 2026 |
| 2 | Develop the lifecycle monitoring platform core | Build modules for client registration/profiling, assessments, training logs, and intervention records with audit trails and reports | ≥95% functional accuracy in core modules during QA (test cases passed) | Team has skills, CI/CD, and test automation; scope limited to core features for depth over breadth | Core lifecycle data enables downstream analytics, compliance, and service management | October 2026 |
| 3 | Integrate AI features | Implement productivity risk prediction and job-matching recommendations using competencies, attendance, and performance trends | Validated via staff feedback and test metrics per NFR-Accuracy (e.g., AUC/top-k hit rate targets) | Leverage existing ML frameworks, historical data, and MLOps pipeline; human-in-the-loop review | AI augments staff decisions, improving prioritization and match quality | November 2026 |
| 4 | Implement placement and outcome tracking | Add employer organizations/roles, vacancy records, referrals, interviews, offers/placements, retention follow-ups, and notifications with end-to-end status flow | Correct status transitions and accurate placement/retention reports across the funnel | Build on existing data model and workflow engine; use event-driven notifications | Tracks program impact and employer engagement; closes the lifecycle loop | December 2026 |
| 5 | Evaluate usability and performance | Conduct SUS survey, task-based usability tests, and staff interviews; performance/load testing vs targets | SUS ≥70; target response times met; positive qualitative feedback on decision support | Plan test scripts, recruit representative staff, and run iterative fixes | Ensures the system is usable in real operations and meets performance SLAs | January 2027 |

### 1.5 SCOPE AND LIMITATIONS

#### 1.5.1 SCOPE

- Focus on AVRC Region IX lifecycle monitoring from enrollment to job placement for PWD clients
- Modules include: client registration/profiling, assessments (behavioral, functional, skills), training/productivity monitoring, interventions, reports/analytics, employer/vacancy management, referrals and placement tracking, basic notifications.
- AI functionalities: productivity risk prediction (e.g., risk of non-completion/low performance) and job-matching recommendations based on documented skills, interests, and performance.
- Role-based access: client (limited), staff (counselor/trainer), admin, employer (restricted).
- Web-based application with responsive design and accessibility-informed UI.

#### 1.5.2 LIMITATIONS

- Geographic scope limited to AVRC Region IX for evaluation.
- Requires internet connectivity; offline capture limited to forms with later sync (optional).
- AI scope limited to structured data features (no deep learning on video/audio; no real-time labor-market scraping).
- Payment, logistics, and external HR IS integrations are out of scope.
- Employer network management limited to registered partners during pilot.
- Security uses standard best practices implemented during development; full enterprise hardening and penetration testing may exceed project timeline.
- Intended for academic/institutional use; large-scale rollout may require further enhancements. .

### 1.6 SIGNIFICANCE OF THE STUDY

- **Students/End-Users**- Receive timely, personalized feedback and clearer pathways from training to employment through structured monitoring and AI-informed suggestions.
- **Faculty/Administrators-** Gain a unified view of client lifecycle data, standardized assessments, analytics, and streamlined reporting for data-driven decisions.
- **Future Researchers-** A replicable model and dataset structure for AI-enabled rehabilitation monitoring and inclusive employment systems.
- **Institution (ZPPSU/CICS)-** Demonstrates social-impact innovation and strengthens contributions to inclusive technology and community development.

### 1.7 DEFINITION OF TERMS

- **Lifecycle Monitoring:** End-to-end tracking of a client’s journey across intake, assessment, training, placement, and retention.
- **Productivity Risk Prediction:** AI-generated estimation of the likelihood of suboptimal outcomes (e.g., low attendance, incomplete training) to inform early interventions.
- **Job Matching:** Algorithmic ranking of vacancies aligned to a client’s skills, interests, functional capacities, and performance trends.
- **Assessment:** Structured evaluation instruments (behavioral, functional, skills/competency) recorded in the system.
- **Placement:** Verified employment or internship engagement, including start date, role, status, and retention checkpoints.

## CHAPTER 2 — REVIEW OF RELATED LITERATURE AND SYSTEMS

- **TECHNICAL BACKGROUND**

The development of InkluTrack is grounded in a multi-disciplinary technical foundation that integrates artificial intelligence (AI), web application engineering, data architecture for longitudinal case tracking, and inclusive design. The core novelty lies in unifying lifecycle monitoring from enrollment through assessment, training, productivity development, and job placement within a single platform designed for vocational rehabilitation contexts.

Artificial intelligence supports three principal capabilities in InkluTrack: predictive analytics for productivity and risk-of-dropout estimation, recommendation engines for training pathways and interventions, and job matching aligned to client profiles and capability constraints. For productivity and readiness prediction, supervised learning models using tabular behavioral and performance features (attendance, task completion rates, counselor notes encoded via NLP, standardized assessment scores) can provide risk flags and trajectory forecasts. Techniques such as gradient boosting, random forests, and calibrated logistic regression are suitable in small-to-medium datasets typical of rehabilitation centers, while explainability methods (feature importance, SHAP) maintain clinician trust and transparency. For recommendations, hybrid approaches that combine rule-based guardrails (reflecting clinical constraints, assistive needs, and employer accommodations) with content-based similarity over competency matrices can generate safe and context-aware suggestions, minimizing bias and overfitting risks. Job matching can be implemented through skill-to-occupation vectorization where client capability vectors are compared against simplified job requirement vectors augmented with accommodation metadata.

Natural language processing enables structured insights from unstructured notes and observations. Lightweight transformer-based text embeddings or sentence encoders can support classification of behavioral indicators and extraction of key events from counselor narratives while preserving privacy through on-premise or private-cloud deployment. A constrained taxonomy for behavior and intervention tags standardizes inputs for consistent analytics.

Systems architecture for InkluTrack adopts a modular, service-oriented web design that separates concerns across a presentation layer (responsive web UI with accessibility-first components), an application layer (RESTful or GraphQL APIs enforcing role-based access control), a data layer (relational database optimized for longitudinal records and event sourcing), and an analytics layer (model serving, batch pipelines, and scheduled scoring). Event-driven patterns capture time-stamped client states across lifecycle stages, which is essential for trajectory analysis and outcome evaluation. To ensure maintainability and auditability, the platform incorporates immutable logs for assessments, interventions, and placement outcomes, along with versioned model artifacts and data lineage tracking.

Inclusive and ethical design principles are interwoven throughout. Accessibility conformance follows WCAG guidelines and universal design principles to ensure perceivable, operable, understandable, and robust interfaces across diverse abilities. Practical interface choices include scalable typography, high-contrast themes, keyboard and screen-reader navigability, clear error recovery, and plain-language microcopy. Ethical AI is enforced through bias assessments, human-in-the-loop review of sensitive recommendations, conservative defaults, and opt-out mechanisms. Privacy and security controls include least-privilege role management, PH data protection compliance, encryption in transit and at rest, audit trails, and de-identification for analytics.

Deployment considerations prioritize reliability in low-resource settings. A cloud-first but bandwidth-aware stack supports intermittent connectivity through client-side caching and queued synchronization. Batch jobs score predictive models on daily or weekly cycles to limit infrastructure costs, while asynchronous workers handle report generation and notifications. Observability includes metrics for data completeness, model drift, and service health, enabling proactive quality assurance.

- **RELATED STUDIES**
    - **FOREIGN**

Engelbrecht, Shaw, and van Niekerk (2017) synthesized transition-to-work frameworks for youth with disabilities and emphasized structured, continuous support as a determinant of successful competitive employment. The review underlines the value of coordinated, stage-based interventions that InkluTrack operationalizes through an integrated lifecycle model and longitudinal tracking.

Ravoaja (2025) mapped key labor market integration phases for PWDs, including job acquisition, retention, and long-term progression. The findings support lifecycle structuring in InkluTrack by aligning monitoring and analytics to these phases, thereby enabling phase-specific metrics and interventions.

Reims and Schels (2022) presented cohort evidence that school-to-work transitions are prolonged without structured support. This underscores the need for continuous guidance and progress visibility, which InkluTrack addresses via end-to-end tracking and alerts that mitigate stagnation between stages.

Omar et al. (2024) demonstrated that targeted skills-development interventions improve employability, suggesting that fine-grained monitoring of training activities and competencies can inform adaptive interventions. InkluTrack codifies competency attainment and ties it to productivity indicators to recommend next-step trainings.

Ouyang, Zheng, and Jiao (2023) reviewed AI-driven performance prediction and learning analytics, reporting improved engagement and outcomes through predictive feedback. Translating these insights beyond education, InkluTrack applies predictive models to vocational productivity and readiness, with careful constraint handling to avoid overgeneralization.

Sánchez-Castañeda and Arruñada (2024) described AI applications across the employee lifecycle, including recruitment, onboarding, and retention. InkluTrack adapts these lifecycle concepts for PWD rehabilitation contexts by introducing accommodations and capability alignment as first-class model features rather than post-hoc adjustments.

Schloemer-Jarvis et al. (2022) found that inclusive HR practices strengthen employment outcomes for PWDs. InkluTrack’s job-matching emphasizes employer-side accommodations and documented inclusive practices as part of matching criteria, improving placement suitability and retention.

Tilmes (2022) warned of algorithmic bias risks in AI recruitment. InkluTrack incorporates fairness checks, transparent explanation interfaces, and human validation checkpoints for sensitive recommendations to reduce disparate impacts on PWD clients.

Seva (2020) reported that productivity is contingent on job–capability fit. InkluTrack’s capability-to-task mapping and accommodations metadata directly reflect this principle in job-matching and individualized work-readiness scoring.

- **LOCAL**

Baes-Enriquez (2025) identified behavioral challenges among PWD trainees, including emotional dysregulation, impulsivity, absenteeism, and noncompliance, while noting the value of counseling. InkluTrack captures these behavioral indicators as standardized events and integrates counseling records to evaluate intervention efficacy over time.

Chiu et al. (2023) documented barriers to rehabilitation in the Philippines, such as accessibility and service fragmentation. InkluTrack addresses fragmentation by centralizing assessments, training data, and placement tracking into a unified platform accessible to authorized staff.

Conde and Teleron (2025) showed that centralized performance systems improve decision-making and accessibility. InkluTrack extends this paradigm from academic monitoring to vocational productivity, standardizing metrics while incorporating employment outcomes.

Local program observations at AVRC Region IX point to manual and fragmented records, inefficient reporting, and weak visibility of placement outcomes. InkluTrack’s longitudinal database and reporting suite provide standardized indicators, faster retrieval, and automated outcome dashboards for administrators and program evaluators.

- **RELATED SYSTEMS**
    - **FOREIGN & LOCAL**

Foreign and local systems offer partial capabilities relevant to InkluTrack but lack holistic lifecycle integration with AI. Health-focused platforms like OpenMRS and DHIS2 exemplify robust data management and analytics yet operate at patient care or population levels without employment integration. Case management tools such as Penelope, Casebook, and the U.S. Vocational Rehabilitation Case Management System support documentation and workflows but do not provide continuous, individualized lifecycle tracking with predictive insights and job matching. Performance monitoring systems like ETO emphasize program outcomes and dashboards but have limited individual-level predictive analytics and do not bridge to job placement. AI education analytics and job recommender prototypes demonstrate prediction and matching but are not tailored to PWD rehabilitation pathways, ethical safeguards for disability data, or localized placement ecosystems.

InkluTrack synthesizes these strands by combining case management rigor with longitudinal lifecycle modeling, AI-based productivity prediction, inclusive job matching, and accessible, role-based interfaces within a single, rehabilitation-centered platform.

- **SYNTHESIS OF THE STUDY**

The literature consistently supports three pillars for improving PWD employment outcomes: lifecycle-structured support, continuous and individualized monitoring, and data-informed interventions. Empirical and review studies show that coordinated transitions and targeted skills development improve readiness and placement, while algorithmic tools can elevate decision quality when applied responsibly. Existing systems validate the feasibility and utility of centralized data, dashboards, and program analytics but reveal a gap in unifying enrollment, behavioral assessment, training progress, productivity metrics, and job placement into an integrated, AI-enabled application tailored to PWD rehabilitation contexts.

InkluTrack addresses this gap by operationalizing a lifecycle framework with standardized data capture across stages, predictive analytics that inform proactive interventions, and job-matching that encodes accommodations and capability fit. The system’s emphasis on inclusive and ethical AI, explainability, and human-in-the-loop safeguards responds to well-documented risks of bias in recruitment technologies. Within the Philippine context and AVRC workflows, InkluTrack’s end-to-end approach is positioned to reduce fragmentation, improve reporting efficiency, elevate data accuracy, and ultimately enhance placement and retention outcomes.

Table 2. Synthesis of Related Studies and Research Gaps

| No. | Title of Study | Author/s & Year | Purpose / Objective | Methodology | Key Findings | Relevance to InkluTrack | Research Gap |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Work Transition of Youth with Disabilities | Engelbrecht et al., 2017 | Examine transition-to-work systems for PWDs | Systematic review (SALSA) | Structured, continuous support improves employment | Supports lifecycle structuring and continuous monitoring | Lacks digital, real-time lifecycle tracking |
| 2 | Labor Market Integration of PWDs | Ravoaja, 2025 | Identify employment phases for PWDs | Systematic review | Job acquisition, retention, and growth phases identified | Aligns lifecycle stages with monitoring and analytics | No automated tracking or implementation |
| 3 | Behavioral Challenges in Training | Baes-Enriquez, 2025 | Assess behavioral issues affecting training | Mixed-methods | Dysregulation, impulsivity, absenteeism affect outcomes | Justifies behavioral/event tracking and counseling analytics | No continuous digital monitoring of behavior |
| 4 | Skills Intervention and Employability | Omar et al., 2024 | Evaluate interventions for job readiness | Mixed-methods | Targeted skills training improves employability | Validates competency-based tracking and adaptive plans | No real-time, individualized progress analytics |
| 5 | School-to-Work Transition Delays | Reims & Schels, 2022 | Analyze transition duration | Cohort analysis | Transitions prolong without structured support | Motivates alerts and stage-to-stage progression tracking | No integrated digital support platform |
| 6 | AI in Learning Analytics | Ouyang et al., 2023 | Review AI prediction and engagement | Review/experimental | Prediction improves outcomes via feedback | Adapts prediction to productivity/readiness domains | Education-focused; lacks employment linkage |
| 7 | AI Across Employee Lifecycle | Sánchez-Castañeda & Arruñada, 2024 | Analyze AI in HR lifecycle | Analytical review | AI enhances recruitment, onboarding, retention | Informs lifecycle modeling and placement modules | Not PWD-specific; lacks accommodation modeling |
| 8 | Inclusive HR Practices for PWDs | Schloemer-Jarvis et al., 2022 | Review HR inclusion evidence | Systematic review | Inclusion practices improve outcomes | Embeds employer accommodations in matching | No operational digital system |
| 9 | Productivity and Job Fit | Seva, 2020 | Measure productivity determinants | Time study/work sampling | Productivity depends on capability–task fit | Grounds capability-to-job matching logic | Focuses on employed; no pre-employment tracking |
| 10 | Algorithmic Bias in Recruitment | Tilmes, 2022 | Analyze AI discrimination risks | Conceptual analysis | AI may discriminate without safeguards | Motivates fairness checks and human-in-the-loop | No lifecycle or rehabilitation framing |
| 11 | Barriers to Rehabilitation (PH) | Chiu et al., 2023 | Identify access and delivery barriers | Q-methodology | Accessibility and service gaps persist | Justifies centralized, accessible monitoring platform | No lifecycle productivity focus |
| 12 | Centralized Performance Monitoring | Conde & Teleron, 2025 | Develop centralized monitoring system | SDLC | Improves decision-making and access | Extends to vocational productivity and placement | Academic context; lacks employment integration |

Table 3. Synthesis of Related Systems and Research Gaps

| No. | System | Study Author/s & Year | Purpose / Objective | Key Features | Relevance to InkluTrack | Research Gap |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Vocational Rehabilitation Case Mgmt (US) | U.S. Dept. of Education, 2022 | Manage rehabilitation services and employment docs | Case records, service history, employment docs | Validates structured data for PWD rehabilitation | No AI analytics; limited lifecycle continuity |
| 2 | Efforts to Outcomes (ETO) | Social Solutions, 2022 | Measure program outcomes | Dashboards, outcome reporting | Informs reporting and KPI tracking | Limited individual lifecycle and prediction |
| 3 | OpenMRS | OpenMRS Community, 2022 | Manage patient records | Electronic records, modular data | Demonstrates centralized records and extensibility | Healthcare-only; no training or placement tracking |
| 4 | DHIS2 | University of Oslo, 2023 | Health data analytics | Visualization, real-time analytics | Informs dashboarding and aggregation | Population-level focus; lacks individualized lifecycle |
| 5 | Penelope / Casebook CMS | Athena; Casebook PBC, 2022–23 | Manage social service cases | Intake, notes, workflow, reporting | Aligns with case documentation and workflows | No predictive analytics; no job placement linkage |
| 6 | Apricot Social Solutions | Bonterra, 2023 | Track client data and outcomes | Custom forms, outcome measurement | Supports M&E processes | Lacks AI; no structured lifecycle model |
| 7 | AktiFAME | Remus et al., 2022 | Support return-to-work interventions | Screening, counseling, intervention tracking | Aligns with work readiness processes | No full lifecycle integration through placement |
| 8 | AI Learning Analytics Systems | Ouyang et al., 2023 | Predict performance and engagement | Predictive models, feedback loops | Technical reference for prediction layer | Education-bound; not employment-focused |
| 9 | AI Job Recommendation Systems | Tavakoli et al., 2022 | Match skills with jobs using ML/NLP | Job–skill matching | Basis for job-matching module | Not tailored to PWD accommodations or ethics |
| 10 | Case Mgmt in Social Work | Salovaara & Ylönen, 2022 | Evaluate client information systems | Documentation support | Highlights lack of holistic trajectory views | No AI or longitudinal lifecycle support |
| 11 | Tele-Rehabilitation Systems | Liu et al., 2022 | Remote therapy support | Remote monitoring, guidance | Shows feasibility of digital rehab tracking | Therapy-focused; no productivity or placement |
| 12 | Student Performance Monitoring | Conde & Teleron, 2025 | Centralize student indicators | Real-time tracking, level classification | Extends concept to vocational productivity | No employment transition module |

## CHAPTER 3 — DESIGN AND METHODOLOGY

This chapter details the design methodology, requirements analysis, system design, and architectural specifications for InkluTrack: AI-Enabled Lifecycle-Based Smart Application for PWD Productivity Development: From Enrollment to Job Placement. The project uses an Agile SDLC with iterative cycles and continuous engagement with AVRC Region IX trainers, counselors, and administrators.

- **REQUIREMENTS ANALYSIS**

Stakeholder Identification. PWD Clients (Trainees): Individuals enrolled at AVRC Region IX undergoing assessment, training, internship, and job placement who require accessible, guided, and privacy-compliant interfaces for daily logging, attendance, activity plans, and feedback. AVRC Staff (Trainers, Counselors, Case Managers): Personnel responsible for profiling, assessment entry, intervention planning, daily productivity tracking, counseling notes, and evaluation; they require dashboards, alerts, and longitudinal reports. Administrators (AVRC Management): Personnel overseeing system configuration, user access, program KPIs, compliance, and analytics; they require governance tools, audit trails, and aggregated insights. Employment Partners (HR Liaisons/Employers): External entities providing job opportunities, interview schedules, and feedback; they require a simplified portal for vacancy posting, candidate review, and placement confirmation.

Problem Identification. Fragmented records across assessment, training, and placement impede timely decisions and cohesive support. Latency and inconsistency in documenting interventions reduce effectiveness and continuity of care. Lack of standardized productivity metrics and lifecycle views obscures readiness and progress. Limited AI-supported insights constrain proactive risk mitigation, job matching, and personalized training plans. Manual reporting consumes staff time and increases data quality risks. Insufficient accessibility and inclusive UX hinder consistent client participation.

- **REQUIREMENTS ANALYSIS**

Stakeholder Identification. PWD Clients (Trainees): Individuals enrolled at AVRC Region IX undergoing assessment, training, internship, and job placement who require accessible, guided, and privacy-compliant interfaces for daily logging, attendance, activity plans, and feedback. AVRC Staff (Trainers, Counselors, Case Managers): Personnel responsible for profiling, assessment entry, intervention planning, daily productivity tracking, counseling notes, and evaluation; they require dashboards, alerts, and longitudinal reports. Administrators (AVRC Management): Personnel overseeing system configuration, user access, program KPIs, compliance, and analytics; they require governance tools, audit trails, and aggregated insights. Employment Partners (HR Liaisons/Employers): External entities providing job opportunities, interview schedules, and feedback; they require a simplified portal for vacancy posting, candidate review, and placement confirmation.

Problem Identification. Fragmented records across assessment, training, and placement impede timely decisions and cohesive support. Latency and inconsistency in documenting interventions reduce effectiveness and continuity of care. Lack of standardized productivity metrics and lifecycle views obscures readiness and progress. Limited AI-supported insights constrain proactive risk mitigation, job matching, and personalized training plans. Manual reporting consumes staff time and increases data quality risks. Insufficient accessibility and inclusive UX hinder consistent client participation.

Table 1. Functional Requirements of InkluTrack

| Req. ID | Module | Description | Priority |
| --- | --- | --- | --- |
| FR-01 | User & Role Management | Register and manage users with roles (Client/Staff/Administrator/Employer) via email or institutional SSO. | High |
| FR-02 | Authentication & Access | Secure login, password reset, MFA option, and role-based authorization using JWT/OAuth2. | High |
| FR-03 | Client Profiling | Create and update comprehensive client profiles including disability type, assistive needs, skills, education, and work preferences. | High |
| FR-04 | Assessment Management | Record standardized assessments (behavioral, skills, functional capacity) with instruments, scores, dates, and assessor. | High |
| FR-05 | Individual Development Plan (IDP) | Generate and track personalized plans with goals, milestones, targeted competencies, and review dates. | High |
| FR-06 | Training & Attendance | Log training sessions, attendance, session objectives, tasks, and trainer feedback; capture time-on-task. | High |
| FR-07 | Productivity Tracking | Record daily/weekly productivity indicators (completion rate, quality score, task adherence, incidents). | High |
| FR-08 | Intervention & Counseling | Document counseling notes, interventions, referrals, and follow-up actions with scheduling and reminders. | High |
| FR-09 | AI Productivity Prediction | Provide short-term and mid-term productivity risk scores and suggested interventions based on history and assessments. | High |
| FR-10 | Job Matching & Recommendations | Recommend job roles and vacancies based on skills, preferences, accessibility needs, and readiness score. | High |
| FR-11 | Employer Portal | Allow employers to post vacancies, specify accommodations, review anonymized candidate profiles, and confirm placements. | Medium |
| FR-12 | Internship/OJT | Track internship assignments, attendance, supervisor feedback, and workplace accommodations. | Medium |
| FR-13 | Placement Tracking | Manage interview schedules, job offers, placement status, start dates, retention checkpoints, and exit reasons. | High |
| FR-14 | Alerts & Notifications | Send in-app and email alerts for missed sessions, declining productivity trends, upcoming reviews, and interviews. | Medium |
| FR-15 | Reports & Analytics | Generate client-level trajectories, cohort dashboards, intervention effectiveness, and outcome KPIs. | High |
| FR-16 | Document Management | Store and version key documents (assessment forms, consent, resumes, MOUs) with role-based access. | Medium |
| FR-17 | Audit Trail & Logs | Record data changes, access events, and administrative actions for compliance and oversight. | High |
| FR-18 | Data Import/Export | Import legacy records (CSV/XLSX) and export reports with data minimization and anonymization options. | Medium |
| FR-19 | Accessibility Settings | Per-user settings for font size, contrast, text-to-speech toggle, and simplified navigation. | High |
| FR-20 | Feedback & Surveys | Collect periodic satisfaction and self-efficacy surveys from clients and employers. | Low |

Table 2. Non-Functional Requirements of InkluTrack

| Req. ID | Category | Description | Metric / Acceptance Criteria |
| --- | --- | --- | --- |
| NFR-01 | Usability | New users complete core tasks (log attendance, view plan) without assistance within 10 minutes. | SUS ≥ 70; Task success ≥ 85% |
| NFR-02 | Accessibility | Conform to WCAG 2.1 AA for perceivable, operable, understandable, and robust interfaces. | WCAG 2.1 AA compliance |
| NFR-03 | Performance | Typical page loads and dashboard queries under normal 4G/Wi-Fi conditions. | P95 response ≤ 2.5 s |
| NFR-04 | Security | Encrypt data in transit and at rest; strong password hashing; least-privilege RBAC. | TLS 1.2+; AES-256 at rest; bcrypt cost ≥ 10 |
| NFR-05 | Reliability | Service availability during pilot and evaluation phases. | Uptime ≥ 99% |
| NFR-06 | Scalability | Support expansion to additional AVRC centers and employer partners without redesign. | Horizontal scaling; stateless API |
| NFR-07 | Maintainability | Modular, documented codebase with CI linting and tests. | Test coverage ≥ 70%; cyclomatic complexity limits |
| NFR-08 | Compatibility | Web app supports modern browsers; responsive for tablet use in labs. | Chrome/Edge/Safari (latest 2 versions) |
| NFR-09 | AI Model Quality | Productivity risk model precision/recall on validation; job match top-k relevance. | F1 ≥ 0.70; Top-5 hit rate ≥ 0.75 |
| NFR-10 | Data Privacy | Compliance with RA 10173 (Philippine DPA) and privacy-by-design principles. | DPA-aligned DPIA; consent logs |
| NFR-11 | Auditability | Comprehensive, immutable logs for data changes and access. | 100% critical events logged |
| NFR-12 | Localization | Support English and Filipino labels; configurable date/time formats. | i18n enabled; locale switch |

- **DESIGN OF SOFTWARE SYSTEM PRODUCTS AND PROCESS**

#### 3.3.1 System Architecture.

InkluTrack adopts a three-tier architecture: Presentation Layer (web front end), Application Logic Layer (API and services), and Data Layer (operational database, analytics store, and AI services).

- Presentation Layer: Responsive web application built with React (or Vue) and TypeScript, optimized for tablet and desktop use in AVRC labs; ARIA landmarks, keyboard navigation, text-to-speech integration hooks; communicates with backend via REST/JSON and WebSocket for live alerts.
- Application Logic Layer: Node.js/Express (or NestJS) for business logic, RBAC, multi-tenant center support, scheduling, notification service; OAuth2/JWT for auth; file service for documents; background jobs (BullMQ/Celery bridge) for AI inference, report generation, and ETL.
- Data Layer: PostgreSQL for transactional storage (clients, assessments, sessions, placements); an analytics warehouse (e.g., PostgreSQL read replica or ClickHouse/BigQuery in later phases) for cohort dashboards; object storage (S3-compatible) for documents; AI services using Python (FastAPI) with scikit-learn/XGBoost/LightGBM for productivity prediction and job matching. Optional vector search (e.g., pgvector) for semantic matching between skills and job descriptions.
- Integration Services: Email/SMS gateway for notifications; calendar integration (ICS feeds) for reviews and interviews; optional integration with labor market feeds or employer ATS via secure APIs in future phases.
- Security and Privacy: Data segmentation per center; field-level access controls; encryption at rest and transit; configurable retention; consent tracking and purpose limitation.

#### 3.3.2 Use Case Diagrams.

**Figure 2** Use Case Diagram: Workforce Development & Assessment System

3.1.2 Data Flow Diagrams

**Figure 3** Data Flow Diagrams

3.1.3 Entity-Relationship Diagram

**Figure 4** Data Flow Diagrams

#### 1.3.5. USER INTERFACE (Mock-Ups)

#### 3.3.8 Development Methodology.

**Project approach**InkluTrack adopts an iterative, user-centered, and evidence-informed development approach combining Agile sprints with staged validation at AVRC Region IX. The methodology emphasizes accessibility-by-design, ethical AI, data protection, and interoperability with government workflows (e.g., AVRC case handling, placement services, and future PWD Unified ID verification). Progress is measured by sprint deliverables, acceptance criteria, and usability and performance thresholds defined with AVRC stakeholders.

Phases and timelinePhase 0: Inception and governance (Weeks 0–1)

- Establish project governance, roles, and RACI; sign data-sharing and ethical compliance agreements with AVRC Region IX.
- Define scope boundaries, risks, and mitigation plans; confirm target users (PWD clients, trainers, counselors, administrators, placement officers).
- Approve measurable success criteria: ≥90% feature completion for MVP, ≥70 SUS score, ≥20% reduction in reporting time compared to baseline, and demonstrable AI recommendation outputs validated by staff.

Phase 1: Requirements and service design (Weeks 1–2)

- Conduct contextual inquiry, process mapping, and journey mapping across lifecycle stages: enrollment, assessment, training, productivity monitoring, internship/OJT, job matching, placement, and follow-up.
- Derive functional and non-functional requirements, including accessibility targets (WCAG 2.1 AA), language localization, offline-tolerant data entry for field use, auditability, and role-based access.
- Co-design low-fidelity wireframes for the web app and admin console; validate with AVRC staff through think-aloud reviews and quick A/B options for data-entry flows.

Phase 2: Architecture and data design (Weeks 1–2, overlapping)

- Define a modular, service-oriented architecture: Authentication and RBAC, Client Profile and Case Module, Assessment and Monitoring, Training and Attendance, Productivity and Evaluation, AI Services (productivity prediction and job matching), Reporting and Dashboards, Notifications and Tasks, and Placement and Retention Tracking.
- Design the data model to support longitudinal records, standardized assessment instruments, and time-series productivity metrics. Include fields enabling alignment with national processes (e.g., PWD identification, AVRC training courses, OJT, and placement categories used by AVRC and DSWD).
- Plan integration hooks for future interoperability (e.g., NCDA/DSWD systems, Unified PWD ID verification via QR-backed lookups once publicly available) while operating offline if external APIs are not yet accessible.

Phase 3: Core platform implementation (Weeks 3–6)

- Backend services: Implement authentication (RBAC, password policy, optional 2FA for admin roles), user management, client intake and profiling, assessment records, training modules, attendance, productivity logs, and secure file storage for case documents.
- Frontend application: Build responsive, accessible interfaces for staff and administrators; implement forms with validation, keyboard navigation, and assistive tech support; provide dashboards for caseload, red-flag alerts (e.g., absenteeism spikes), and progress trajectories.
- Data quality controls: Enforce required fields, validation rules, and data dictionaries to standardize productivity indicators and assessment inputs.
- Initial reports: Generate baseline reports (enrollment, attendance, productivity trends, interventions logged, and placement pipeline).

Phase 4: AI feature development and validation (Weeks 7–8)

- Productivity prediction: Implement interpretable models (e.g., tree-based or generalized additive models) to forecast short-term risk indicators (absenteeism likelihood, productivity dips) using time-series training, attendance, and intervention features. Provide explanation views (top contributing factors) to support ethical, transparent use.
- Job matching recommendations: Build a rules-plus-ML hybrid: a competency-to-job taxonomy aligned to AVRC courses and typical partner-employer roles; enrich with a lightweight embedding or similarity model to rank opportunities by skills fit, accommodations, and client preferences. Allow staff to adjust thresholds and record rationale for final recommendations.
- Bias and fairness checks: Run pre-deployment bias diagnostics; exclude protected attributes from model features; institute human-in-the-loop override; log AI suggestions and final staff decisions for audit.

Phase 5: Administration, notifications, and workflow automation (Weeks 9–10)

- Admin console: Manage users, roles, training programs, assessment templates, job catalogs, employer partners, and configurable metrics.
- Workflow and alerts: Implement rule-based triggers for counseling follow-ups, missed sessions, productivity drops, nearing graduation, OJT readiness, and post-placement check-ins.
- Communication: In-app notifications and email/SMS gateways (as permitted) for reminders, interviews, OJT schedules, and employer coordination.

Phase 6: System integration testing and UAT (Weeks 11–12)

- Integration testing: Validate end-to-end scenarios from enrollment to placement, including edge cases (re-enrollment, program switching, prolonged absence).
- Performance and security: Validate response times for common tasks (<2 seconds typical), conduct basic penetration testing, verify role isolation, and test data export for reports.
- User Acceptance Testing: Facilitate structured observation sessions with AVRC staff and a controlled group of PWD clients for assisted interactions. Collect SUS, task success rates, error rates, and qualitative feedback on clarity, workload, and perceived helpfulness of AI insights. Iterate and refine UI copy, data fields, and model thresholds.

Phase 7: Deployment, training, and evaluation (Week 13)

- Deployment: Provision production environment, migrate pilot data (if any), seed catalogs (courses, job categories, employer list), and set backups and monitoring.
- Capacity building: Deliver role-based training for staff (intake, training, counseling, placement) and administrators; provide quick-reference guides and short video walkthroughs.
- Initial evaluation: Compare baseline vs. post-deployment indicators (report generation time, data completeness, number and timeliness of interventions, job-matching turnaround). Document lessons learned and a sustainability plan for maintenance, updates, and future integrations.

## REFERENCES

Baes-Enriquez, A. T. (2025). The impact of vocational counseling on the behavioral challenges of persons with disability. Area Vocational Rehabilitation Center III.

Bonterra. (2023). Apricot social solutions system. https://www.bonterratech.com

Casebook PBC. (2023). Casebook case management system. https://www.casebook.net

Chiu, C., Sy, A., Oruga, M., & Bonito, S. (2023). Barriers to accessing rehabilitation services in the Philippines: A Q-methodology approach. Disability and Rehabilitation, 45(12), 1890–1902. https://doi.org/10.1080/09638288.2022.2076937

Conde, M., & Teleron, R. (2025). Development of a student performance monitoring system using SDLC. International Journal of Computing and Digital Systems, 14(1), 1–10.

Engelbrecht, M., Shaw, L., & van Niekerk, L. (2017). The work transition of youth with disabilities: A systematic review. Work, 57(4), 593–607. https://doi.org/10.3233/WOR-172568

Harvard Humanitarian Initiative. (2023). KoBoToolbox data collection platform. https://www.kobotoolbox.org

Li, L., Wang, M., & Jian, M. (2026). Artificial intelligence-assisted case management in social work services: A systematic review. Research on Social Work Practice, 36(3), 268–278.

Liu, Y., Guo, S., Yang, Z., Hirata, H., & Tamiya, T. (2022). A home-based tele-rehabilitation system with enhanced therapist–patient interaction: A feasibility study. IEEE Journal of Biomedical and Health Informatics, 26(8), 4176–4186. https://doi.org/10.1109/JBHI.2022.3145637

Omar, S., et al. (2024). Skills intervention programs and employability of persons with disabilities: A mixed-methods study. Journal of Vocational Rehabilitation, 61(2), 211–225.

OpenMRS Community. (2022). OpenMRS open-source medical record system. https://openmrs.org

Ouyang, F., Zheng, L., & Jiao, P. (2023). Artificial intelligence in education: A review of learning analytics and prediction models. Computers and Education: Artificial Intelligence, 4, 100118. https://doi.org/10.1016/j.caeai.2023.100118

Remus, L., Grope, M., Lemke, S., et al. (2022). An innovative case management intervention (AktiFAME) to support return to work. BMC Health Services Research, 22, 342. https://doi.org/10.1186/s12913-022-07482-9

Reims, N., & Schels, B. (2022). School-to-work transitions of young people with disabilities. European Sociological Review, 38(6), 924–939. https://doi.org/10.1093/esr/jcac024

Ravoaja, M. (2025). Labor market integration of persons with disabilities: A systematic review. Disability & Society.

Salovaara, S., & Ylönen, K. (2022). Client information systems’ support for case-based social work. Nordic Social Work Research, 12(3), 364–378. https://doi.org/10.1080/2156857X.2021.1999847

Sánchez-Castañeda, A., & Arruñada, B. (2024). Artificial intelligence and the employee lifecycle: Implications for HR systems. Journal of Business Research, 172, 114–125.

Schloemer-Jarvis, A., et al. (2022). Human resource practices for inclusion of persons with disabilities: A systematic review. Human Resource Management Review, 32(2), 100833.

Seva, R. R. (2020). Productivity assessment of persons with disabilities in the workplace. International Journal of Industrial Ergonomics, 76, 102936. https://doi.org/10.1016/j.ergon.2020.102936

Social Solutions. (2022). Efforts to Outcomes (ETO) software. https://www.socialsolutions.com

Tavakoli, M., et al. (2022). AI-based job recommendation system using machine learning and natural language processing. Expert Systems with Applications, 198, 116745.

Tilmes, C. (2022). Algorithmic bias and discrimination in AI-based recruitment systems. Ethics and Information Technology, 24(3), 1–12.

U.S. Department of Education. (2022). Vocational rehabilitation case management system. https://www.ed.gov

University of Oslo. (2023). District Health Information Software 2 (DHIS2). https://dhis2.org
