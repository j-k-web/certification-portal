// Programmes and their Year 1 Semester 1 units.
// `id` is used as the PDF file name in backend/papers/<id>.pdf
// Where the source lists alternatives ("X / Y"), the unit is kept as one entry.

const UCI101 = { id: 'UCI101', code: 'UCI 101', title: 'Fundamentals of Information Technology' };
const EMA111 = { id: 'EMA111', code: 'EMA 111', title: 'Environmental Education' };

const PROGRAMMES = [
  {
    id: 'arts-history-kiswahili',
    name: 'History & Kiswahili (AHI / AKI)',
    units: [
      { id: 'AHI101', code: 'AHI 101', title: 'Early African History / Introduction to History' },
      { id: 'AHI103', code: 'AHI 103', title: 'African History since 1885' },
      { id: 'AKI101', code: 'AKI 101', title: 'Introduction to Language / Utangulizi wa Lugha na Isimu' },
      { id: 'AKI103', code: 'AKI 103', title: 'Introduction to the History of Kiswahili' },
      { id: 'AKI105', code: 'AKI 105', title: 'Basic Kiswahili Grammar / Sarufi Msingi ya Kiswahili' },
      UCI101,
      EMA111,
    ],
  },
  {
    id: 'arts-history-cre',
    name: 'History & CRE / Religion (AHI / ARE)',
    units: [
      { id: 'AHI101', code: 'AHI 101', title: 'Early African History / Introduction to History' },
      { id: 'AHI103', code: 'AHI 103', title: 'African History since 1885' },
      { id: 'ARE101', code: 'ARE 101', title: 'Introduction to the Study of Religion' },
      { id: 'ARE103', code: 'ARE 103', title: 'Religion and Science' },
      { id: 'ARE105', code: 'ARE 105', title: 'Comparative Religion / Introduction to Biblical Studies' },
      UCI101,
      EMA111,
    ],
  },
  {
    id: 'arts-kiswahili-cre',
    name: 'Kiswahili & CRE / Religion (AKI / ARE)',
    units: [
      { id: 'AKI101', code: 'AKI 101', title: 'Introduction to Language / Utangulizi wa Lugha na Isimu' },
      { id: 'AKI103', code: 'AKI 103', title: 'Introduction to the History of Kiswahili' },
      { id: 'AKI105', code: 'AKI 105', title: 'Basic Kiswahili Grammar / Sarufi Msingi ya Kiswahili' },
      { id: 'ARE101', code: 'ARE 101', title: 'Introduction to the Study of Religion' },
      { id: 'ARE103', code: 'ARE 103', title: 'Religion and Science' },
      UCI101,
      EMA111,
    ],
  },
  {
    id: 'arts-history-geography',
    name: 'History & Geography (AHI / NGE)',
    units: [
      { id: 'AHI101', code: 'AHI 101', title: 'Early African History / Introduction to History' },
      { id: 'AHI103', code: 'AHI 103', title: 'African History since 1885' },
      { id: 'NGE101', code: 'NGE 101', title: 'Introduction to Geography' },
      { id: 'NGE102', code: 'NGE 102', title: 'Map Interpretation and Descriptive Statistics' },
      { id: 'NGE103', code: 'NGE 103', title: 'Fundamentals of Physical Geography' },
      UCI101,
      EMA111,
    ],
  },
  {
    id: 'arts-geography-kiswahili',
    name: 'Geography & Kiswahili (NGE / AKI)',
    units: [
      { id: 'NGE101', code: 'NGE 101', title: 'Introduction to Geography' },
      { id: 'NGE102', code: 'NGE 102', title: 'Map Interpretation and Descriptive Statistics' },
      { id: 'NGE103', code: 'NGE 103', title: 'Fundamentals of Physical Geography' },
      { id: 'AKI101', code: 'AKI 101', title: 'Introduction to Language / Utangulizi wa Lugha na Isimu' },
      { id: 'AKI103', code: 'AKI 103', title: 'Introduction to the History of Kiswahili' },
      UCI101,
      EMA111,
    ],
  },
  {
    id: 'arts-english-literature',
    name: 'English & Literature (AEN / ALI)',
    units: [
      { id: 'AEN101', code: 'AEN 101', title: 'Introduction to Language' },
      { id: 'AEN105', code: 'AEN 105', title: 'Communication Skills / Language Use' },
      { id: 'ALI101', code: 'ALI 101', title: 'Introduction to Literary Studies' },
      { id: 'ALI103', code: 'ALI 103', title: 'Introduction to East African Literature' },
      { id: 'ALI109', code: 'ALI 109', title: 'Practice of Creative Writing / Introduction to Orature' },
      UCI101,
      EMA111,
    ],
  },
  {
    id: 'bsc-information-technology',
    name: 'Bachelor of Science in Information Technology',
    units: [
      { id: 'CIT101', code: 'CIT 101', title: 'Discrete Structures I' },
      { id: 'CIT103', code: 'CIT 103', title: 'Mathematics for IT' },
      { id: 'CIT105', code: 'CIT 105', title: 'Electrical Principles' },
      { id: 'CIT109', code: 'CIT 109', title: 'Computer Applications' },
      { id: 'CIT111', code: 'CIT 111', title: 'Fundamentals of Programming' },
      UCI101,
      EMA111,
    ],
  },
  {
    id: 'bsc-computer-science',
    name: 'Bachelor of Science in Computer Science',
    units: [
      { id: 'CCS105', code: 'CCS 105', title: 'Fundamentals of Computing' },
      { id: 'CCS101', code: 'CCS 101 / CCS 103', title: 'Introduction to Programming & Discrete Structures I' },
      { id: 'MMA100', code: 'MMA 100 / MMA 101', title: 'Basic Mathematics / Analytical Geometry' },
      { id: 'MMA102', code: 'MMA 102', title: 'Calculus I' },
      { id: 'SPH101', code: 'SPH 101 / SPH 103', title: 'Mechanics / Optics or Basic Electronics' },
      UCI101,
      EMA111,
    ],
  },
  {
    id: 'ba-criminology-it',
    name: 'Bachelor of Arts (Criminology, with I.T.)',
    units: [
      { id: 'ACS101', code: 'ACS 101', title: 'Introduction to Criminology' },
      { id: 'ACS103', code: 'ACS 103', title: 'Criminal Justice System and Minorities' },
      { id: 'ACS105', code: 'ACS 105', title: 'Introduction to Criminal Law' },
      { id: 'ACS107', code: 'ACS 107', title: 'Sociology of Crime' },
      { id: 'ACS109', code: 'ACS 109', title: 'Human Rights' },
      { id: 'ASO101', code: 'ASO 101 / DPS 101', title: 'Introduction to Sociology / Basic Concepts in Political Science (support option)' },
      UCI101,
      EMA111,
    ],
  },
  {
    id: 'bsc-hrm-it',
    name: 'Bachelor of Science (Human Resource Management, with I.T.)',
    units: [
      { id: 'BBA111', code: 'BBA 111', title: 'Introduction to Business Studies' },
      { id: 'BAF103', code: 'BAF 103', title: 'Introduction to Accounting I' },
      { id: 'BEC111', code: 'BEC 111', title: 'Introduction to Microeconomics' },
      { id: 'BHR111', code: 'BHR 111', title: 'Principles of Human Resource Management' },
      { id: 'BMS111', code: 'BMS 111 / MMA 104', title: 'Business Mathematics / Descriptive Statistics' },
      UCI101,
      EMA111,
    ],
  },
  {
    id: 'bsc-ecotourism-hotel-it',
    name: 'Bachelor of Science (Eco-Tourism, Hotel & Institution Management, with I.T.)',
    units: [
      { id: 'SEH101', code: 'SEH 101', title: 'Introduction to Hospitality and Tourism' },
      { id: 'SEH103', code: 'SEH 103', title: 'Principles of Ecotourism' },
      { id: 'SEH105', code: 'SEH 105', title: 'Food and Beverage Knowledge / Kitchen Planning & Organisation' },
      { id: 'BBA111', code: 'BBA 111 / SEH 107', title: 'Principles of Management / Introduction to Business Studies' },
      { id: 'FOREIGN-LANG-I', code: 'Foreign Language I', title: 'Introductory French or German' },
      UCI101,
      EMA111,
    ],
  },
];

function findProgramme(name) {
  return PROGRAMMES.find((p) => p.name === name) || null;
}

module.exports = { PROGRAMMES, findProgramme };
