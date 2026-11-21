# LLM-generated quiz and exam questions: how good they are, what catches their errors, regurgitation risk, and the legal position of publishing them

Research date: 2026-11-21. Labels: **[peer-reviewed]** = journal or refereed conference; **[preprint]** = arXiv or other unrefereed; **[web/blog]** = organization or personal site; **[snippet]** = the claim comes from a search-result summary because the page itself could not be fetched, so treat it as unverified. Where I read the full text or abstract myself (via arXiv, Europe PMC, copyright.gov, court PDF, license texts), no label is added beyond the venue type.

Access note: `pmc.ncbi.nlm.nih.gov`, `www.ncbi.nlm.nih.gov` and `academic.oup.com` could not be reached from this session, so PMC articles were read through the Europe PMC full-text API instead. NOAA's disclaimer page returned 403, the QANTA 2025 statistics page timed out, the OpenStax help-center and computer.org pages are JavaScript-only, and the LibreTexts site-wide licensing page returned 404. These gaps are repeated under the relevant questions.

## 1. How often are LLM-written STEM, medical and quiz questions wrong, ambiguous or flawed, and how do they compare with human-written items?

### Takeaway
After expert screening, LLM-drafted multiple-choice items (mostly GPT-4/GPT-4o, some o3-mini and Claude 3.5 Sonnet) perform about as well as human-written items when given to real students: difficulty is similar or a little easier, and discrimination is similar. Raw, unscreened drafts are another matter. Across 71 medical studies, reported error rates ranged from under 1% to 45%. In the larger head-to-head studies, LLM drafts were about 1.5–5 times as likely as human items to have multiple correct answers, factual errors or the wrong difficulty, and they skew toward easy recall. Human-written sets are not error-free either: a few percent errors is normal even in well-known benchmarks, and much more in adversarially written ones.

### Cited Findings

**Systematic reviews and meta-analyses (medicine / health professions)**
- Kıyak, Kaya & Emekli, *Postgraduate Medical Journal*, first published 2026-05-20 **[peer-reviewed]**. This is the largest review: 71 studies from 24 countries, with searches through 15 Feb 2026. Most studies relied on expert review rather than testing with learners. Error rates ranged from <1% to 45%. Median item difficulty was 0.67 and median discrimination 0.28, with reliability of 0.51–0.81. Studies reported up to 31-fold time savings. Conclusion: "LLMs appear useful drafting tools but current evidence does not yet support unsupervised use in summative assessment." — [Kıyak et al. 2026, PMJ](https://academic.oup.com/pmj/advance-article/doi/10.1093/postmj/qgag057/8688271) (abstract read via Europe PMC; the OUP page was unreachable)
- Riehm et al., *PLOS One* 2026 (accepted 18 Dec 2025) **[peer-reviewed]**. A network meta-analysis of health-professions MCQ generation, preregistered as PROSPERO CRD42025608775, with searches to 1 Nov 2024. ChatGPT-3.5 was used in 10 studies, ChatGPT-4 in 4, and Bard 1.0, Llama 2 and ChatPDF.com in others. Only 5 included studies (33%) compared LLM items with human items.
  - **Quality ratings:** ChatGPT-4 was similar to humans on relevance (MD −0.13), clarity (MD −0.03) and distractor quality (MD −0.10), all with very low GRADE certainty. Llama 2 was worse on clarity (MD −1.21) and distractors (MD −1.50). ChatGPT-3.5 had lower distractor quality than ChatGPT-4, Llama 2 and humans.
  - **Discrimination (exploratory post-hoc tests):** ChatGPT-4 items had lower discrimination than human items (p = 0.025) and lower than ChatGPT-3.5 items (p = 0.010).
  - **Accuracy:** only 4 studies measured it (ChatGPT-3.5 and Bard), and none had a human control arm.
  — [Riehm et al. 2026, PLOS One](https://doi.org/10.1371/journal.pone.0340277)
- Artsi et al., *BMC Medical Education* 2024 **[peer-reviewed; 2023-era models]**. Reviewed 8 studies from April–October 2023: 6 used ChatGPT-3.5 and 2 used GPT-4. All 8 contained faulty questions deemed inappropriate for medical exams, and some needed modification before use. — [Artsi et al. 2024](https://doi.org/10.1186/s12909-024-05239-y)

**Head-to-head trials with real examinees (medicine)**
- Law et al., *BMC Medical Education* 25:208, Feb 2025 **[peer-reviewed]**. ChatGPT-4o wrote 100 MCQs and humans wrote 100, for Hong Kong's Primary Examination on Emergency Medicine (August 2024 cohort, 24 doctors).
  - **Psychometrics:** AI items were easier (difficulty 0.78 ± 0.22 vs 0.69 ± 0.23, p < 0.01). Discrimination was similar (0.22 ± 0.23 vs 0.26 ± 0.26).
  - **Expert review, AI vs human items:**

    | Problem | AI items | Human items |
    |---|---|---|
    | Factual inaccuracies | 6% | 4% |
    | Irrelevant to the exam | 6% | 0% |
    | Inappropriate difficulty | 14% | 1% |
    | Duplicated questions | 14% | 7% |
    | Item-writing flaws | 37% | 35% |

    AI items had more ambiguous stems and more unnecessary content in the stem.
  - **Cognitive level:** AI items mostly tested "remember/understand", while human items more often tested "apply/analyse" (χ² = 14.27, p = 0.003).
  - **Time:** 24.5 vs 96 person-hours. Expert comments were pasted back into ChatGPT-4o for iterative revision.
  — [Law et al. 2025](https://doi.org/10.1186/s12909-025-06796-6)
- *npj Digital Medicine* (received 1 Nov 2025) **[peer-reviewed; preregistered, blinded, within-subject]**. GPT-4o ("GPT-4o-Plus", ChatGPT interface, release of 25 Apr 2025) wrote 24 items and specialists wrote 24 topic-matched items, across radiation oncology, radiology and nuclear medicine. 46 medical students took the combined 48-item exam.
  - **Psychometrics:** difficulty 0.65 (human) vs 0.67 (LLM); discrimination 0.27 vs 0.29; neither difference significant.
  - **Detectability:** students identified item origin at chance (0.50).
  - **Expert agreement:** expert ratings of appropriateness and quality had very low interrater agreement (ICC 0.07–0.18).
  - **Screening:** two candidate items were generated per topic, and the second was used if the first "contained an error or was overly easy or confusing". A "very small number" of generated items had inaccuracies or outdated information and were removed or edited. The exact count is not given in the text I read.
  — [npj Digital Medicine 2025/26](https://www.nature.com/articles/s41746-025-02313-7)

**Model-by-model comparisons**
- Obeid et al., *BMC Medical Education*, 7 Feb 2026 **[peer-reviewed]**. Eight models (GPT-4 Turbo, GPT-3.5 Turbo 0125, o1 Mini, o1 Preview, GPT-4, Claude 3.5 Sonnet, Claude 3 Opus, Gemini) each generated 2 sets of items for 13 USMLE-aligned ethics outcomes, rated by 4 experts.
  - Claude 3.5 Sonnet was highest overall (86.28%), on accuracy (85.57%) and on clarity (91.73%). o1 Mini scored 85.19%, and GPT-4 had the best relevance (88.65%).
  - GPT-4 Turbo and o1 Preview were lowest (76.79%), so newer models were not uniformly better.
  - Weaknesses included "incorrect answer selection" and "best answer not available".
  — [Obeid et al. 2026](https://link.springer.com/article/10.1186/s12909-026-08781-z) (abstract read via Europe PMC)

**STEM and computing**
- Doughty et al., ACE 2024 (ACM) **[peer-reviewed]**. GPT-4 generated 651 MCQs, compared with 449 human-written MCQs, for 246 learning objectives in 6 Python courses.
  - **Answer and distractor flaws:** 4.9% of generated items had more than one correct choice (vs 1.1% of human items). 4.0% had distractors that gave away the answer (vs 0.9%).
  - **Overall pass rate:** 81.7% of generated items passed every rubric criterion, i.e., fewer than 1 in 5 would need edits.
  - **Difficulty:** generated items were easier. Student raters got 71.5% of generated items right vs 62.6% of human items; instructors got 80.1% vs 76.3%.
  — [Doughty et al. 2024](https://arxiv.org/abs/2312.03173)
- Isley et al., "Assessing the Quality of AI-Generated Exams: A Large-Scale Field Study" (arXiv Aug 2025; also listed in AAAI proceedings). o3-mini generated items from instructor materials through generate–critique–revise loops. An AI judge then removed any item whose answer it disagreed with, and the 10 "hardest" of 20 were kept.
  - **Scale:** 1,208 students in 71 college classes (CS, math, chemistry and others) took AI exams. 478 students in 20 statistics classes took AP Statistics practice items as the benchmark.
  - **Results (IRT):** AI items performed "on par" with standardized items. They were somewhat easier (60% vs 39% correct) but more discriminating. The authors flag possible differential item functioning.
  — [arXiv 2508.08314](https://arxiv.org/abs/2508.08314); [AAAI listing](https://ojs.aaai.org/index.php/AAAI/article/download/41205/45166)
- Feng et al., NAACL 2024 Findings **[peer-reviewed]**. For math MCQs, LLMs "can generate some mathematically valid distractors" but are "less adept at anticipating common errors or misconceptions among real students". — [Feng et al. 2024](https://arxiv.org/abs/2404.02124)
- Balepur et al., "Reverse Question Answering", NAACL 2025 (Boyd-Graber's group) **[peer-reviewed]**. Sixteen LLMs were given an answer and asked to write a trivia question for it.
  - **Numerical answers:** LLMs were "much less accurate" at this than at ordinary QA, especially for integers. The accuracy gap exceeded 0.80 for Command-R and LLaMA-3.
  - **Textual answers:** the trend reversed slightly, with models a little more accurate at RQA than QA.
  - **Self-answering:** models often answered their own invalid questions correctly (33% of cases for Claude-Opus), so the errors are not just knowledge gaps.
  - **Multi-hop:** models struggled to write valid multi-hop questions.
  — [arXiv 2410.15512](https://arxiv.org/abs/2410.15512)
- Wang et al. 2026 **[preprint]**, on LLMs judging difficulty from item text alone.
  - **Accuracy:** zero-shot GPT-4.1 reached QWK 0.578 at predicting difficulty levels, below ConvBERT (0.625).
  - **Hard items:** all LLMs struggled to label hard items, and GPT-5.4 tended to underestimate difficulty.
  - **Authors' caution:** be careful using LLMs to generate items at a targeted difficulty.
  — [arXiv 2607.28634](https://arxiv.org/abs/2607.28634)
- arXiv 2606.18709 (June 2026) **[preprint]**. Across 42 LLMs, direct predictions of item discrimination aligned weakly with human data. The best response-based proxy reached a rank correlation of only 0.231. — [arXiv 2606.18709](https://arxiv.org/abs/2606.18709)

**Base rates for human-written items (for comparison)**
- MMLU-Redux: re-annotation of 5,700 MMLU questions estimates that 6.49% of MMLU questions contain errors, and 57% of the analyzed Virology questions do. — [Gema et al., arXiv 2406.04127](https://arxiv.org/abs/2406.04127) **[preprint]**
- Humanity's Last Exam (HLE), FutureHouse audit, July 2025 **[web/blog]**. 29 ± 3.7% (95% CI) of 321 text-only chemistry and biology questions had answers directly contradicted by peer-reviewed literature. HLE's own three-expert follow-up found about 18% of a bio/chem subset problematic, with at least one reviewer disagreeing 25% of the time. — [FutureHouse](https://futurehouse.org/research/hle-exam)
- HLE-Verified, 2026 **[preprint]**. Of 2,500 items, 668 were verified as-is, 1,143 needed revision, and 689 stayed "uncertain". Models gained 7–10 accuracy points on the cleaned set. — [arXiv 2602.13964](https://arxiv.org/abs/2602.13964)
- SimpleQA (OpenAI, 2024) **[preprint]**. Even after two independent annotators had to agree, a third-annotator check on 1,000 items put the error rate at about 3%. — [arXiv 2411.04368](https://arxiv.org/abs/2411.04368)
- In a large standardized-testing program, 34% of 52,759 human-written ELA and math items were permanently rejected from operational use. — [arXiv 2608.06609](https://arxiv.org/abs/2608.06609) **[preprint]**
- A National Academies panel reported that about half of new NAEP items are rejected during piloting. — [National Academies, ch. 3](https://www.nationalacademies.org/read/26427/chapter/6) **[snippet]**

### Inferences
- **Raw error rate.** For a Rebound-style pipeline, a reasonable planning assumption for unscreened drafts from a current model is that 5–20% will have a substantive defect. Defects include a wrong or contestable key, a second correct option, a factual or outdated error, the wrong difficulty, or a near-duplicate. This is triangulated from Law (6% factual, 14% difficulty, 14% duplicate), Doughty (4.9% multiple-correct; 18.3% failing at least one criterion) and the <1–45% range in Kıyak.
- **Riskiest item type.** NSB Short Answer math and physics computations are probably riskiest, because answer-first ("reverse") generation of numeric questions is where LLMs fail most (Balepur 2025).
- **Difficulty drift.** LLM items drift easy and toward recall (Law; Doughty; Isley; Wang 2026). NSB-style difficulty will need calibration from player data, not the model's own estimate.
- **Model choice.** Model rankings vary by task, and newer is not always better (Obeid 2026; Riehm's GPT-4 vs GPT-3.5 discrimination result). Rebound should pilot several models on its own items rather than assume the newest is best.
- **Realistic target.** Good human sets still carry about 3–6% errors (SimpleQA, MMLU). A residual error rate of 1–3% after verification is probably the right benchmark, not zero.

### Gaps
- I found no peer-reviewed study of LLM-generated Science Bowl or quiz bowl questions played by real competitors. Nearly all real-examinee evidence is medical or college coursework, and mostly multiple choice.
- Little published evidence covers generation by Claude 4-class, GPT-5-class or Gemini 2.5/3-class models specifically. Most head-to-head studies use GPT-4/GPT-4o (2023–2025). Of the newest models, only o3-mini (Isley 2025) and Claude 3.5 Sonnet (Obeid 2026) appear in generation studies.
- The npj study does not report how many GPT-4o drafts were replaced. Law et al. give percentages but no breakdown of wrong answer keys versus other factual errors.

## 2. Quiz bowl and trivia research, and how well LLMs answer Science Bowl-style questions

### Takeaway
Boyd-Graber's group has produced the main quiz bowl tools: answer-equivalence rules taken from trivia judging (PEDANTS), IRT-based comparisons of humans and AI on quiz questions (CAIMIRA), and metrics for adversarial question writing (AdvScore). Their work shows that LLMs are strong at fact retrieval, weaker than humans at abductive and conceptual clues, and unreliable at writing questions for a given answer, especially numeric answers. I found no published benchmark built from National Science Bowl questions.

### Cited Findings
- **PEDANTS** (Li, Mondal, Liang, Nghiem & Boyd-Graber), EMNLP 2024 Findings **[peer-reviewed]**. Builds answer-correctness rubrics and datasets "adopted from the Trivia community" (NAQT rules, EfficientQA). It proposes a cheap, interpretable classifier that is more stable than exact match and BERTScore. — [ACL Anthology](https://aclanthology.org/2024.findings-emnlp.548); [arXiv 2402.11161](https://arxiv.org/abs/2402.11161)
- **CAIMIRA** (EMNLP 2024 Main) **[peer-reviewed]**. Applies item response theory to more than 300,000 responses from about 70 AI systems and 155 humans across thousands of quiz questions. Humans beat AI on knowledge-grounded abductive and conceptual reasoning. GPT-4 and LLaMA did better at "targeted information retrieval and fact-based reasoning". — [arXiv 2410.06524](https://arxiv.org/abs/2410.06524)
- **AdvScore** (NAACL 2025) **[peer-reviewed]**. A human-grounded "adversarialness" metric that also identifies poor examples. It used 9,347 human responses and ten LMs to track model improvement from 2020 to 2024, and produced the AdvQA dataset. — [arXiv 2406.16342](https://arxiv.org/abs/2406.16342)
- Sung, Mondal & Boyd-Graber 2024 **[preprint]**. When human writers try to stump LLMs, they "sometimes resort to tricks that result in poor questions that are ambiguous, subjective, or confusing not just to a computer but also to humans". The paper proposes metrics and incentives against this. — [arXiv 2401.11185](https://arxiv.org/abs/2401.11185)
- Reverse QA (Balepur et al., NAACL 2025): LLMs are weak at writing questions for numeric answers (details under Q1). For answer matching, the authors used GPT-4o for entity answers and rules for numeric answers. These methods had the highest agreement with humans (94% on average). — [arXiv 2410.15512](https://arxiv.org/abs/2410.15512)
- An adversarial quiz bowl writing interface for QANTA was tested on only ten questions **[preprint, single author]**. — [arXiv 2404.00011](https://arxiv.org/abs/2404.00011)
- **QANTA 2025.** The June 2025 human-computer cooperative tournament's statistics page reports eight AI players. The top bot (BlackRaven) had 78.1% bonus accuracy, and another (RodeRunner) averaged 4.16 points per tossup. The page does not say which systems are LLM-based. — [QANTA 2025 AI stats](http://users.umiacs.umd.edu/~ying/qb/2025_QANTA/QANTA_2025_AI_Stats_Combined.html) **[snippet; page timed out]**. A UMD news story (Oct 2025) says a similar event was planned for early 2026. — [Maryland Today](https://today.umd.edu/humans-and-ai-join-forces) **[snippet]**
- **IRT for quiz and benchmark data.** Rodriguez et al. (ACL 2021) show that a Bayesian IRT leaderboard model "can guide what to annotate, identify annotation errors, detect overfitting, and identify informative examples". — [ACL 2021](https://aclanthology.org/2021.acl-long.346/) **[peer-reviewed]**
- **Science Bowl benchmark search.** Searches found no study or benchmark that uses NSB questions to measure LLM accuracy. DOE's tips page says Short Answer questions should have one- or two-word answers with minimal room for interpretation. — [DOE NSB Tips and Resources](https://science.osti.gov/wdts/nsb/Regional-Competitions/Resources/Tips-and-Resources) **[snippet]**
- SciFaultyQA **[preprint, Dec 2024]**. GPT-4o, GPT-o1-preview and Gemini Flash often answer deliberately ill-posed science questions anyway. For example, they gave a nonsensical "0.5 child" answer in 8 of 10 trials. — [arXiv 2412.11988](https://arxiv.org/abs/2412.11988)

### Inferences
- **Build an internal benchmark.** Rebound's 23,720 DOE items could serve as an LLM benchmark for this use case, whether as "solver" (how often a model answers NSB items correctly) or "checker". The library is public on the web, though, so solver scores would be inflated by memorization (see Q4).
- **Answer checking.** PEDANTS-style rules suit NSB short answers: accept aliases, require exact numbers unless approximation is asked for, and reject answers that merely overlap in wording. They would fit both Rebound's answer checker and any automatic check of a generated key.
- **Strengths and weak spots.** Fact-retrieval items are where LLMs are strongest (CAIMIRA), so AI-written recall tossups will be the easiest to produce correctly. Multi-step, conceptual or numeric items need the most verification (Reverse QA).

### Gaps
- I found no published results for current models (Claude 4.x, GPT-5.x, Gemini 3.x) on NSB or quiz bowl questions, and no NSB-derived benchmark.
- I found no peer-reviewed quiz bowl study in which LLMs write full packets that are then played by humans. The 2025–26 QANTA events may produce data, but I could not read the results page.

## 3. Verification and calibration: which methods measurably reduce errors, and what still slips through?

### Takeaway
The best-supported checks are these:
- having an independent model (or person) solve the item blind and discarding disagreements;
- computing numeric answers with code;
- calibrating against real responses (IRT or classical statistics);
- final human review.

LLM judges reliably catch surface item-writing flaws but are weak on subjective quality and on whether an item fits its learning objective. Experts themselves disagree on quality ratings. The failures that survive are:
- ill-posed questions that solvers answer anyway;
- errors that two models share;
- wrong difficulty;
- near-duplicates;
- fairness or bias problems.

### Cited Findings

**Independent solving and agreement filters**
- SimpleQA: a second annotator answered each question without seeing the first answer, and items were dropped if the answers disagreed or the question lacked an indisputable answer. A third annotator then answered a 1,000-item sample, giving an estimated residual error of about 3%. — [arXiv 2411.04368](https://arxiv.org/abs/2411.04368) **[preprint]**
- Isley et al.: an o3-mini judge removed items whose answer it disagreed with. The surviving items performed comparably to standardized items with 1,208 students. — [arXiv 2508.08314](https://arxiv.org/abs/2508.08314)
- Dual-LLM generator/evaluator study, IISA 2026: a second LLM solved items without seeing the intended answer. 53.70% of items were accepted and 44.44% rejected for answer mismatch, and confidence and apparent quality alone were insufficient for validation. — [IEEE CSDL](https://www.computer.org/csdl/proceedings-article/iisa/2026/11705534/2kbuDL1j6Du) **[snippet; page is JavaScript-only, not verified]**
- "Benchmark Illusion" **[preprint, Feb 2026]**. LLMs with similar accuracy disagree on 16–66% of MMLU-Pro and GPQA items, and top frontier models still disagree on 16–38%. Cross-model checks will therefore flag many items, and some flags will be hard but valid items. — [arXiv 2602.11898](https://arxiv.org/abs/2602.11898)
- Cross-model perplexity **[preprint, 2026]**. A second model's "surprise" at the first model's answer detects errors better than self-uncertainty (MMLU AUROC 0.75 vs 0.59), including confident errors. — [arXiv 2603.25450](https://arxiv.org/abs/2603.25450)
- HLE-Verified: model confidence was strongly associated with errors in the problem statement or reference answer. — [arXiv 2602.13964](https://arxiv.org/abs/2602.13964) **[preprint]**
- **Self-consistency** (Wang et al., ICLR 2023) **[peer-reviewed, older]**: sampling several reasoning paths and taking the majority answer improved GSM8K by +17.9%, SVAMP by +11.0% and ARC-challenge by +3.9%. — [arXiv 2203.11171](https://arxiv.org/abs/2203.11171)
- An informal analysis of a customer-support intent task (not question writing) found a single-model error rate of 14.1%. Sending two-model disagreements (about 13% of cases) to a human cut that to 3.7%. — [sanand0 blog](https://sanand0.github.io/llmevals/double-checking/) **[web/blog; different task]**

**Code execution for numeric answers**
- **PAL** (Gao et al., ICML 2023) **[peer-reviewed, older]**. Having the LLM write a program and run it in Python beat chain-of-thought. PAL with Codex surpassed PaLM-540B chain-of-thought on GSM8K "by absolute 15% top-1". The motivation: LLMs "often make logical and arithmetic mistakes in the solution part, even when the problem is decomposed correctly". — [arXiv 2211.10435](https://arxiv.org/abs/2211.10435)

**What blind solving misses**
- Solvers answer ill-posed questions rather than flagging them (SciFaultyQA: 8 of 10 trials). — [arXiv 2412.11988](https://arxiv.org/abs/2412.11988) **[preprint]**
- LLMs often answer their own invalid generated questions "correctly" (33% for Claude-Opus). Self-checking by the same model can therefore pass broken items. — [arXiv 2410.15512](https://arxiv.org/abs/2410.15512)

**Retrieval-grounded generation**
- A GPT-4o study of Malaysian Form 1 math MCQs grounded in official curriculum documents **[preprint, Aug 2025]**. RAG pipelines "significantly outperform non-grounded prompting", with higher curriculum alignment and factual validity. The evaluation was automated (semantic similarity plus a RAG-QA check), not done by experts or students. — [arXiv 2508.04442](https://arxiv.org/abs/2508.04442)
- URAG **[preprint, 2026]**: retrieval depth, noisy retrieval and confidence cues can amplify confident errors. "No single RAG approach is universally reliable." — [arXiv 2603.19281](https://arxiv.org/abs/2603.19281)

**LLM-as-judge for item quality**
- Moore et al., EC-TEL 2023 **[peer-reviewed, 2023]**. On 200 student-written MCQs with a 19-criterion item-writing-flaw rubric, a rule-based method caught 91% of human-identified flaws and GPT-4 caught 79%. — [arXiv 2307.08161](https://arxiv.org/abs/2307.08161)
- SAQUET (AIED 2024) **[peer-reviewed]**: over 94% accuracy at detecting whether human-identified flaws are present, across chemistry, statistics, CS, humanities and healthcare. — [arXiv 2405.20529](https://arxiv.org/abs/2405.20529)
- Moore & Diana, AIME-Con 2026 narrative review of 14 reports **[peer-reviewed conference; arXiv]**. "High label-level accuracy often coexists with weak positive case detection." Rubric definitions vary, and evidence that revisions actually help is mixed. — [arXiv 2610.04267](https://arxiv.org/abs/2610.04267)
- Aydin et al., *Frontiers in Medicine* 2026 **[peer-reviewed]**. Claude Sonnet 4, Gemini 2.5 Flash and Llama 3.3 70B were compared with 3 experts on 85 internal-medicine MCQs.
  - **Cognitive level:** Claude and Gemini had moderate agreement with experts on Bloom level; Llama was lower (κ = 0.266).
  - **Learning-objective alignment:** weak to moderate agreement for all models (ICC 0.121–0.380).
  - **Technical flaws:** near-perfect agreement on negatively worded stems and substantial agreement on inconsistent numerical data (κ = 0.661), but poor agreement on subjective flaws.
  — [Aydin et al. 2026](https://doi.org/10.3389/fmed.2026.1866674) (read via Europe PMC)
- JUDGE-BENCH (Bavaresco et al., ACL 2025) **[peer-reviewed]**. Across 20 datasets, 11 LLMs and more than 70,000 human-judged instances, LLM judges aligned with humans on some tasks but were inconsistent across and within tasks. The authors' advice: validate a judge against human labels before relying on it. — [ACL 2025](https://aclanthology.org/2025.acl-short.20)
- Human experts are not a gold standard for "quality" either: in the npj study, specialist ratings of appropriateness had ICC 0.07–0.18. — [npj Digital Medicine](https://www.nature.com/articles/s41746-025-02313-7)
- Automated item evaluation **[preprint, Aug 2026]**. A model trained to predict which of 52,759 historical items were rejected used item text plus Qwen3-generated critiques. It reached AUC 0.80 overall (math AUC 0.86, F1 0.73). Lowering the threshold raised math sensitivity to 0.91 at specificity 0.56. It struggled with items flagged for bias, sensitivity or fairness. — [arXiv 2608.06609](https://arxiv.org/abs/2608.06609)

**Expert-review throughput and cost**
- **Time.** Law et al.: producing and revising 100 exam MCQs took 24.5 person-hours with GPT-4o vs 96 person-hours by hand, including expert review cycles. — [Law et al. 2025](https://doi.org/10.1186/s12909-025-06796-6). Kıyak et al. found up to 31-fold time savings across studies. — [PMJ 2026](https://academic.oup.com/pmj/advance-article/doi/10.1093/postmj/qgag057/8688271)
- **Cost per item:**
  - NAEP: about $3,700 per item, weighted average for creation and review. — [National Academies](https://www.nationalacademies.org/read/26427/chapter/6) **[snippet]**
  - Vendor marketing claims: $500–$1,000 per item from Meazure Learning ([Meazure](https://www.meazurelearning.com/exam-technology/itematic-automated-item-generation)) and $200–$2,000 to build and vet one item from Caveon ([Caveon](https://info.caveon.com/hubfs/AIG/Infographics/AIG%20Lifetime%20Value.pdf)). **[snippet; vendor claims]**

**Calibration with real response data (IRT)**
- Isley et al. used a hierarchical IRT model with anchor items to estimate difficulty and discrimination for AI items with real students. — [arXiv 2508.08314](https://arxiv.org/abs/2508.08314)
- IRT can flag annotation errors in a benchmark (Rodriguez et al., ACL 2021). — [ACL 2021](https://aclanthology.org/2021.acl-long.346/)
- **Simulated examinees.** Using LLMs as simulated examinees is promising but less accurate than real field testing. Maeda (2025, *Educational and Psychological Measurement*) found human field testing more accurate, and found that AI examinees responded "in fundamentally different ways". — [Maeda 2025](https://journals.sagepub.com/doi/10.1177/00131644241281053) **[snippet]**. Liu et al. (2025, BJET) report high correlations between LLM-respondent and human IRT parameters, but summaries give different figures (>0.8 vs >0.7). — [Liu et al. 2025](https://bera-journals.onlinelibrary.wiley.com/doi/10.1111/bjet.13570) **[snippet; conflicting figures]**
- **Predicting statistics from text.** LLMs predict discrimination poorly from item text (best rank correlation 0.231) — [arXiv 2606.18709](https://arxiv.org/abs/2606.18709). They also underestimate difficulty — [arXiv 2607.28634](https://arxiv.org/abs/2607.28634). **[preprints]**

**Near-duplicate detection**
- Lee et al., ACL 2022 **[peer-reviewed, older]**. Exact-substring and near-duplicate (MinHash-style) deduplication found that over 1% of unprompted LM output was copied verbatim from training data. Models trained on deduplicated data emitted memorized text 10 times less often. Train–test overlap affected over 4% of standard validation sets. — [arXiv 2107.06499](https://arxiv.org/abs/2107.06499)
- SemDeDup (2023) **[preprint]**: embedding-based semantic deduplication removed 50% of a LAION subset with minimal performance loss. — [arXiv 2303.09540](https://arxiv.org/abs/2303.09540)
- Exam-security study, Dec 2025 **[preprint]**. 160 items from GPT-4o, Claude 4 Sonnet and Gemini 2.5 Flash were compared with PubMedBERT/BioBERT cosine similarity. Some model pairs exceeded the 0.65 "high-similarity" threshold in narrow topics, so different models converge on similar items. — [arXiv 2512.23729](https://arxiv.org/abs/2512.23729)
- Within-set duplication was 14% for GPT-4o items vs 7% for human items. — [Law et al. 2025](https://doi.org/10.1186/s12909-025-06796-6)

### Inferences
- A defensible pipeline for Rebound has six layers:
  1. Ground each item in a cited source passage.
  2. Have a different model family solve the item blind, and reject on key mismatch.
  3. For any numeric answer, compute the key with executed code, not model arithmetic.
  4. Run an explicit "is this well-posed, with one defensible answer? list acceptable alternate answers" check, PEDANTS-style.
  5. Run a near-duplicate check against the 23,720-item library and within the batch, using MinHash or n-gram overlap plus embeddings.
  6. Have a human approve the item.
  After release, Rebound can use buzz and accuracy data to flag items with negative or near-zero discrimination, or anomalous accept/reject disputes, as likely errors. This follows from Rodriguez 2021 and Isley 2025 rather than from any NSB-specific study.
- **Rejection rates.** Expect agreement filters to reject a large share of drafts: about 44% in the IISA study, and 16–38% disagreement even among frontier models. Throughput planning should assume 1.5–2 drafts per kept item, consistent with NAEP's roughly 50% piloting rejection for human items.
- **What survives all of the above:** shared misconceptions (two models agreeing on a wrong key), outdated "facts", subtle ambiguity that only an expert or a real competitor notices, wrong difficulty, and bias or fairness problems. Player data and an easy "report this question" button are the backstop.
- **Human review cost.** Human review cost is dominated by expert time. Using the Law et al. ratio of about 4× less effort than writing from scratch is a reasonable first estimate, but it comes from medicine, not NSB.

### Gaps
- I found no study that measures the residual error rate after combining blind multi-model solving, code-checked numerics and human review on STEM short-answer items.
- I found no per-item expert review time (minutes per AI draft) in a STEM setting; only aggregate person-hours (Law) and fold-savings (Kıyak).
- I could not verify the IISA 2026 numbers or the Liu (BJET) correlations from primary text.
- Evidence on retrieval grounding comes from automated evaluation, not expert or student testing.

## 4. Memorization: do LLMs reproduce existing quiz questions or copyrighted text, and what mitigates it?

### Takeaway
Yes. Frontier models can reproduce public benchmark items (GPT-4 recovered a masked MMLU wrong option word-for-word 57% of the time) and, under adversarial extraction, near-entire copyrighted books (jailbroken Claude 3.7 Sonnet, 95.8% for one book). Memorization grows with model size, with how often a text is duplicated online, and with the length of prompt context. In ordinary prompting most text is not memorized, but widely copied text is at higher risk. Published sample question sets on the open web are exactly that kind of text, and question generators also converge on similar items. The practical mitigations are post-hoc overlap and similarity checks against known corpora plus human review. Model-side safeguards reduce but do not eliminate the risk.

### Cited Findings
- Carlini et al., ICLR 2023 **[peer-reviewed]**. Memorization grows log-linearly with model capacity, with the number of times an example is duplicated in training data, and with prompt context length. — [arXiv 2202.07646](https://arxiv.org/abs/2202.07646)
- Deng et al., NAACL 2024 **[peer-reviewed]**. "TS-Guessing" masks a wrong MCQ option and asks the model to fill it in. ChatGPT reproduced the masked MMLU option exactly 52% of the time and GPT-4 57% of the time. — [arXiv 2311.09783](https://arxiv.org/abs/2311.09783)
- Golchin & Surdeanu, ICLR 2024 **[peer-reviewed]**. "Guided instruction" prompts recover dataset instances, and GPT-4 is contaminated with AG News, WNLI and XSum. — [arXiv 2308.08493](https://arxiv.org/abs/2308.08493)
- Ahmed, Cooper, Koyejo & Liang, Jan 2026 **[preprint]**. Extraction from production models, with experiments run mid-Aug to mid-Sep 2025 and providers notified under a 90-day disclosure window.
  - **No jailbreak needed:** Gemini 2.5 Pro and Grok 3 gave near-verbatim recall of 76.8% and 70.3% of *Harry Potter and the Sorcerer's Stone* without a jailbreak.
  - **Jailbreak needed:** Claude 3.7 Sonnet and GPT-4.1 required one. Jailbroken Claude 3.7 Sonnet output entire books near-verbatim in some cases (95.8%). GPT-4.1 needed about 20 times more attempts and eventually refused (4.0%).
  — [arXiv 2601.02671](https://arxiv.org/abs/2601.02671)
- Cooper, Lemley et al., COLM 2026 **[peer-reviewed conference]**. Across 200 books and 14 open-weight LLMs, "most LLMs do not memorize most books". Llama 3.1 70B, however, "entirely memorizes some books", such as *Harry Potter and the Sorcerer's Stone*. — [arXiv 2505.12546](https://arxiv.org/abs/2505.12546)
- **Contested result.** A 2026 preprint ("Alignment Whack-a-Mole") claims fine-tuning made GPT-4o, Gemini-2.5-Pro and DeepSeek-V3.1 reproduce up to 85–90% of held-out books — [arXiv 2603.20957](https://arxiv.org/html/2603.20957v1) **[snippet]**. A. Feder Cooper (Sept 2026) argues its measurement is invalid: matches too short to count as memorization, possible leakage of the text through the prompt, and no negative controls — [arXiv 2609.09320](https://arxiv.org/abs/2609.09320) **[preprint]**.
- Lee et al., ACL 2022: over 1% of unprompted output from models trained on undeduplicated corpora was verbatim training text, and deduplication cut this tenfold. — [arXiv 2107.06499](https://arxiv.org/abs/2107.06499)
- **Convergence on similar items.** LLMs prompted only with public information produced items close to "guided" items in narrow clinical areas (cosine similarity above 0.65), which raises exposure risk for exam banks. — [arXiv 2512.23729](https://arxiv.org/abs/2512.23729) **[preprint]**
- Creative Commons notes that the only way to know whether a model has memorized content is to find outputs substantially similar to the original, and that not all memorization is infringing. Developer mitigations "may not eliminate" the risk. — [Creative Commons, AI training primer](https://creativecommons.org/using-cc-licensed-works-for-ai-training-2/)
- Anthropic's consumer terms tell users not to rely on outputs "without independently confirming their accuracy". — [Anthropic Consumer Terms](https://www.anthropic.com/legal/consumer-terms)

### Inferences
- **Training-data exposure.** DOE's sample sets and community NSB archives have been on the public web for years and are widely copied. They are therefore likely in frontier models' training data, which raises verbatim-recall risk by Carlini's duplication result. A prompt like "write an NSB-style physics tossup on X" could reproduce a real DOE question or a close paraphrase. Neither result is necessarily infringing, but either defeats the goal of "fresh" practice.
- **Mitigations Rebound can control:**
  - Run an n-gram or MinHash check of every draft against the full 23,720-item library and any team packets, plus an embedding nearest-neighbour check with a human-reviewed threshold.
  - Check against the grounding passage to catch long verbatim spans copied from CC BY-SA or NC sources.
  - Avoid prompts that paste in many real NSB questions as examples, and prefer abstract style guidance.
  - Keep the generation prompt and model version with each item for audit.
- **Effect on benchmarking.** Memorization also inflates any "how well does Claude answer NSB questions" score measured on the public library. A blind-solve verifier will look stronger on recycled content than on genuinely new items.

### Gaps
- I found no study measuring how often LLMs reproduce quiz bowl or Science Bowl questions specifically, verbatim or near-verbatim, during ordinary generation.
- I found no published per-model rate of verbatim regurgitation under normal, non-adversarial question-generation prompts. The book-extraction numbers come from adversarial continuation prompting.

## 5. Copyright and licensing position for publishing AI-generated question sets

### Takeaway
In the U.S., material generated by AI without sufficient human control over its expression is not copyrightable. This rests on the Copyright Office's 2023 guidance and its January 2025 Part 2 report. *Thaler v. Perlmutter* (D.C. Cir., 18 March 2025) affirmed the rule, and the Supreme Court denied review on 2 March 2026. Rebound can publish AI-generated questions, but it probably cannot stop others from copying the purely AI-written parts. Human-written edits and the creative selection and arrangement of a set can be protected.

Anthropic's terms assign Rebound whatever rights Anthropic has in outputs, "if any". The license obligations of grounding sources attach only when Rebound copies or adapts protectable expression, not when it extracts facts:
- CC BY: attribution.
- CC BY-SA: attribution plus ShareAlike on adaptations.
- NC licenses: noncommercial use only.
- U.S. government works: generally public domain, but with endorsement, logo and AI-attribution rules.

### Cited Findings

**U.S. Copyright Office**
- **2023 registration guidance** (88 Fed. Reg. 16,190, 16 Mar 2023):
  - When an AI technology "determines the expressive elements of its output, the generated material is not the product of human authorship" and "must be disclaimed in a registration application".
  - A human may still "select or arrange AI-generated material in a sufficiently creative way", or modify it enough, to earn protection. Copyright then covers "only… the human-authored aspects".
  - AI-generated content that is "more than de minimis" should be explicitly excluded from the application.
  — [USCO 2023 guidance (PDF)](https://www.copyright.gov/ai/ai_policy_guidance.pdf)
- **Part 2 report, Copyrightability** (29 Jan 2025):
  - "Copyright does not extend to purely AI-generated material, or material where there is insufficient human control over the expressive elements."
  - Sufficiency is judged "on a case-by-case basis".
  - "Prompts alone do not provide sufficient human control." Prompts "function as instructions that convey unprotectible ideas".
  - Human authors are entitled to copyright in their expression "perceptible in AI-generated outputs, as well as the creative selection, coordination, or arrangement of material in the outputs, or creative modifications of the outputs".
  - "The case has not been made" for new or sui generis protection for AI output.
  — [USCO Part 2 (PDF)](https://www.copyright.gov/ai/Copyright-and-Artificial-Intelligence-Part-2-Copyrightability-Report.pdf)
- **Report status.** Part 1 (digital replicas) was published 31 Jul 2024. A pre-publication version of Part 3 (generative AI training) was released 9 May 2025, with the final version still pending as of the page fetched. — [USCO AI hub](https://www.copyright.gov/ai/)

**Court decisions**
- ***Thaler v. Perlmutter***, D.C. Cir. No. 23-5233 (argued 19 Sep 2024, decided 18 Mar 2025):
  - "The Copyright Act of 1976 requires all eligible work to be authored in the first instance by a human being."
  - "The human authorship requirement does not prohibit copyrighting work that was made by or with the assistance of artificial intelligence. The rule requires only that the author of that work be a human being."
  — [D.C. Circuit opinion (PDF)](https://media.cadc.uscourts.gov/opinions/docs/2025/03/23-5233.pdf)
- **Certiorari.** The Supreme Court denied certiorari on 2 March 2026 (No. 25-449) without comment. — [Holland & Knight, Mar 2026](https://www.hklaw.com/en/insights/publications/2026/03/the-final-word-supreme-court-refuses-to-hear-case-on-ai-authorship); [Finnegan](https://www.finnegan.com/en/insights/ip-updates/supreme-court-declines-to-hear-thaler-v-perlmutter-leaving-human-authorship-requirement-intact.html) **[law-firm commentary; snippet]**. The Copyright Office's AI page lists the government's brief opposing certiorari. — [USCO AI hub](https://www.copyright.gov/ai/)
- ***Allen v. Perlmutter*** (D. Colo., No. 1:24-cv-02665). A challenge over a Midjourney image created with more than 600 prompts. It was reported still pending without a merits decision as of mid-August 2026. — [Copyright Lately](https://copyrightlately.com/thaler-is-dead-ai-copyright-questions/) **[snippet; docket not checked]**

**Anthropic's terms**
- **Consumer Terms** (Claude.ai and Pro): "As between you and Anthropic… Subject to your compliance with our Terms, we assign to you all of our right, title, and interest—if any—in Outputs." The same terms warn that outputs "may contain material inaccuracies". — [Anthropic Consumer Terms](https://www.anthropic.com/legal/consumer-terms) (fetched 2026-11-21)
- **Commercial Terms** (API keys):
  - Customer "owns its Outputs", and Anthropic "hereby assigns to Customer its right, title and interest (if any) in and to Outputs". "Anthropic may not train models on Customer Content from Services."
  - Anthropic indemnifies claims that the customer's *paid* use or outputs infringe third-party IP. The indemnity excludes claims arising from "modifications made by Customer to the… Outputs", from "the combination of the Services or Outputs with technology or content not provided by Anthropic", from customer inputs, and from use the customer "knows or reasonably should know" infringes.
  — [Anthropic Commercial Terms](https://www.anthropic.com/legal/commercial-terms) (fetched 2026-11-21)

**Creative Commons licenses**
- **CC BY 4.0:**
  - "Adapted Material" means material derived from the licensed work and modified "in a manner requiring permission under the Copyright and Similar Rights held by the Licensor".
  - Where exceptions and limitations apply, such as fair use, "this Public License does not apply, and You do not need to comply with its terms".
  - Attribution may be given "in any reasonable manner", for example a link to a page with the required information. Users must indicate whether they modified the material.
  — [CC BY 4.0 legal code](https://creativecommons.org/licenses/by/4.0/legalcode.en)
- **CC BY-SA 4.0, ShareAlike clause 3(b):** if you share Adapted Material you produce, you must license it under a BY-SA (or compatible) license and add no restrictive terms. — [CC BY-SA 4.0 legal code](https://creativecommons.org/licenses/by-sa/4.0/legalcode.en)
- **Creative Commons AI guidance:**
  - "CC licenses apply only when copyright permission is required." BY, SA and ND are triggered only when works or adaptations are publicly shared, and NC applies to all uses requiring permission.
  - Conservative practice: when retrieval-augmented generation is available, give attribution tied to the specific output with a link.
  — [Creative Commons AI primer](https://creativecommons.org/using-cc-licensed-works-for-ai-training-2/)

**Grounding sources**
- **Wikipedia:** text may be reused under CC BY-SA 4.0 (or GFDL). Modifications or additions to re-used pages "must [be licensed] under the Creative Commons Attribution-Share-Alike License 4.0 or later", and modification must be indicated. — [Wikipedia: Reusing Wikipedia content](https://en.wikipedia.org/wiki/Wikipedia:Reusing_Wikipedia_content)
- **OpenStax:** licenses vary by title.
  - *Introduction to Behavioral Neuroscience* is CC BY-NC-SA 4.0: attribute OpenStax, no commercial use, and share derivatives alike. — [OpenStax preface](https://openstax.org/books/introduction-behavioral-neuroscience/pages/preface)
  - OpenStax help pages and third-party guides say many titles are CC BY 4.0 while some (e.g., Calculus) are NC-SA. Required attribution is to OpenStax, the book title and a link. — [OpenStax help: licensing](https://help.openstax.org/s/article/Licensing-information-of-OpenStax-textbooks) **[snippet; page is JavaScript-only]**
  - OpenStax has a help article titled "Using OpenStax Content with AI Tools", but I could not read it. — [OpenStax help](https://help.openstax.org/0TO6f0000003F84GAE) **[not fetched]**
- **LibreTexts:** licensing is per page and per remix. One page states that, unless otherwise noted, content is CC BY-NC-SA 3.0. "Detailed Licensing" back-matter pages list mixed licenses, some marked "undeclared" for remixed sections. — [LibreTexts Detailed Licensing example](https://chem.libretexts.org/Courses/Smith_College/Advanced_General_Chemistry/zz%3A_Back_Matter/21%3A_Detailed_Licensing); [LibreTexts licensing page example](https://math.libretexts.org/Courses/Clackamas_Community_College/MTH65%3A_Algebra_2/00%3A_Front_Matter/04%3A_Licensing) **[snippet]**
- **NASA:**
  - NASA content "generally [is] not subject to copyright in the United States" and may be used for educational purposes without permission, provided it does not imply endorsement. NASA should be acknowledged.
  - The NASA insignia, logotype and identifiers "are not in the public domain". Third-party material on NASA sites can be copyrighted.
  - **AI-specific guidance:** NASA's "Super Intelligence (SI) Applications" section says attributing SI-generated information "directly to NASA is not permitted", because NASA cannot verify information once it is in a model. You may state that an SI tool "includes NASA source material" but must not imply NASA review or permission. NASA "strongly encourages" marking SI-generated products as such, and its insignia may not appear with SI-generated imagery.
  — [NASA images and media guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/)
- **USGS:** "USGS-authored or produced data and information are considered to be in the U.S. Public Domain". Non-USGS images on USGS sites may be copyrighted, and credit ("U.S. Geological Survey") is requested. — [USGS Copyrights and Credits](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits)
- **DOE:** "Government information at DOE websites is in the public domain", but DOE asks for acknowledgement in later use. Documents and images contributed or licensed by private parties "may be protected". — [DOE Web Policies](https://www.energy.gov/about-us/web-policies)
- **NOAA:** the disclaimer page returned 403, so NOAA's terms were not verified. — [NOAA disclaimer](https://www.noaa.gov/disclaimer) **[not fetched]**

### Inferences
These are not legal advice.
1. **Ownership and protection.**
   - Purely AI-generated questions, even from detailed prompts, are most likely not copyrightable in the U.S. (USCO Part 2; *Thaler*).
   - Rebound may publish them freely, but rivals could copy them. A human's substantive rewrites, and the creative selection and arrangement of a set or packet, may carry thin protection.
   - If Rebound ever registers a compilation, it must disclaim the AI-generated content.
   - A simple policy is to release generated questions under CC0 or CC BY, to remove ambiguity for teams that print or remix them. This is a choice, not a requirement.
2. **Anthropic's terms.**
   - Rebound's server uses the Anthropic API (`server/src/ai.ts`), so the Commercial Terms apply. As between the parties, Rebound owns the outputs, but "if any" means there may be no copyright to own.
   - The IP indemnity covers only paid use and excludes modified outputs and outputs combined with non-Anthropic content. Human-edited, source-grounded question sets probably fall largely outside it, so it should not be treated as insurance.
3. **Facts versus expression.**
   - A question that states a fact drawn from a CC BY-SA Wikipedia article or an OpenStax book generally does not copy protectable expression. On CC's own reading, the license conditions do not then apply.
   - The risk arises when a generated question reuses a source's sentences, distinctive phrasing, figures or problem setups. For CC BY-SA sources, that could make the question set "Adapted Material" and trigger ShareAlike. For NC sources (some OpenStax titles, much of LibreTexts), it would restrict any future paid use.
   - Practical mitigations:
     - Prefer CC BY OpenStax titles and public-domain U.S. agency material for grounding.
     - Run a verbatim-overlap check against the grounding passage.
     - Keep a per-question source link, which also satisfies "reasonable manner" attribution if it turns out to be needed.
4. **Government sources.**
   - Public-domain NASA, USGS and DOE material is the cleanest grounding source.
   - Do not present AI-written questions as "from NASA" (NASA's SI rule), or as DOE- or NSB-endorsed.
   - Label AI-generated sets as such.
   - Be careful with images, which are often third-party copyrighted even on .gov sites.
5. **DOE sample questions.** The copyright status of the DOE NSB sample questions themselves (Rebound's existing library) is not settled by these sources. DOE says government website information is public domain, but contributed materials may not be. This matters if generated items closely paraphrase library items.

### Gaps
- I found no court decision or Copyright Office ruling specifically on AI-generated quiz or test questions, or on how much human editing of a generated question suffices for protection.
- *Allen v. Perlmutter*'s outcome, if any, after August 2026 is unknown.
- NOAA's terms could not be fetched (403).
- OpenStax's AI-specific help article and the canonical LibreTexts licensing policy could not be read.
- I found no CC or court guidance on whether a question that paraphrases a single CC BY-SA sentence is "Adapted Material". This is a gray area.
- I did not verify who authors DOE's NSB questions or whether they are federal works, which another researcher is covering. I also did not check NSB trademark terms.
