/*
  Chart Decoder — Bootcamp content
  A short, skippable warm-up that works for every condition.
  Edit the lists below to change what the bootcamp teaches.

  Abbreviation questions also pull in any term from the master term list
  with Category = "Abbreviation" and Condition = "All".
*/
window.BOOTCAMP = {
  passMark: 0.75, // share of quiz questions needed to mark a unit complete
  units: [
    {
      id: "word-parts",
      title: "Word parts",
      blurb: "Most medical terms are built from a few reusable pieces. Learn the pieces and you can decode words you've never seen.",
      items: [
        { part: "hyper-", meaning: "Above, more than normal", example: "hypertension" },
        { part: "hypo-", meaning: "Below, less than normal", example: "hypotension" },
        { part: "-tension", meaning: "Pressure", example: "hypertension" },
        { part: "cardi/o", meaning: "Heart", example: "cardiology" },
        { part: "nephr/o, ren/o", meaning: "Kidney", example: "nephrology, renal" },
        { part: "-itis", meaning: "Inflammation", example: "nephritis" },
        { part: "-emia", meaning: "Condition of the blood", example: "hyperkalemia (high potassium)" },
        { part: "-ology", meaning: "Study of", example: "cardiology" },
        { part: "brady-", meaning: "Slow", example: "bradycardia" },
        { part: "tachy-", meaning: "Fast", example: "tachycardia" },
        { part: "-megaly", meaning: "Enlargement", example: "cardiomegaly" },
        { part: "-trophy", meaning: "Growth, development", example: "hypertrophy" }
      ]
    },
    {
      id: "abbreviations",
      title: "Common abbreviations",
      blurb: "Clinical notes are dense with shorthand. These show up in almost every chart.",
      items: [
        { part: "BP", meaning: "Blood pressure", example: "BP 148/92" },
        { part: "HR", meaning: "Heart rate", example: "HR 76" },
        { part: "y/o", meaning: "Years old", example: "58 y/o" },
        { part: "c/o", meaning: "Complains of", example: "c/o headache" },
        { part: "SOB", meaning: "Shortness of breath", example: "denies SOB" },
        { part: "BID", meaning: "Twice a day", example: "metformin BID" },
        { part: "PRN", meaning: "As needed", example: "acetaminophen PRN" },
        { part: "s/p", meaning: "Status post (after a procedure or event)", example: "s/p knee replacement" }
      ]
    },
    {
      id: "note-structure",
      title: "How a note is organized",
      blurb: "Notes follow a predictable order. Knowing the sections tells you where to look for what.",
      items: [
        { part: "CC", meaning: "Chief complaint: the reason for the visit, often in the patient's words", example: "\"My blood pressure has been high.\"" },
        { part: "HPI", meaning: "History of present illness: the story of the current problem", example: "Pt c/o headache x 2 days, worse in the morning." },
        { part: "PMH", meaning: "Past medical history: earlier and ongoing conditions", example: "HTN, HLD, T2DM." },
        { part: "ROS", meaning: "Review of systems: a symptom checklist by body system", example: "Denies chest pain, SOB or vision changes." },
        { part: "Exam", meaning: "Physical exam: what the clinician observed and measured", example: "BP 162/98, HR 78. Lungs clear." },
        { part: "A/P", meaning: "Assessment and plan: the diagnosis and next steps", example: "Continue lisinopril 10 mg PO daily; recheck BMP in 2 weeks." },
        { part: "AVS", meaning: "After-visit summary: plain-language instructions for the patient", example: "Take your blood pressure medicine every morning and check your BP at home." }
      ],
      // Note-structure quiz: which section does this line belong to?
      quizStyle: "section"
    }
  ]
};
