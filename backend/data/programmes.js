// Bachelor of Education programmes and their units.
// `id` is used as the PDF file name in backend/papers/<id>.pdf

const UCI101 = { id: 'UCI101', code: 'UCI 101', title: 'Fundamentals of Information Technology' };
const ESE110 = { id: 'ESE110', code: 'ESE 110', title: 'Introduction to Special Needs Education' };
const EPY110 = { id: 'EPY110', code: 'EPY 110', title: 'Introduction to Educational Psychology' };

const PROGRAMMES = [
  {
    id: 'bed-arts-history-kiswahili',
    name: 'Bachelor of Education (Arts, with I.T.) - History & Kiswahili',
    units: [UCI101, ESE110, EPY110],
  },
  {
    id: 'bed-arts-history-cre',
    name: 'Bachelor of Education (Arts, with I.T.) - History & CRE / Religion',
    units: [UCI101, ESE110, EPY110],
  },
  {
    id: 'bed-arts-kiswahili-cre',
    name: 'Bachelor of Education (Arts, with I.T.) - Kiswahili & CRE / Religion',
    units: [UCI101, ESE110, EPY110],
  },
  {
    id: 'bed-arts-history-geography',
    name: 'Bachelor of Education (Arts, with I.T.) - History & Geography',
    units: [UCI101, ESE110, EPY110],
  },
  {
    id: 'bed-arts-geography-kiswahili',
    name: 'Bachelor of Education (Arts, with I.T.) - Geography & Kiswahili',
    units: [UCI101, ESE110, EPY110],
  },
  {
    id: 'bed-arts-english-literature',
    name: 'Bachelor of Education (Arts, with I.T.) - English & Literature',
    units: [UCI101, ESE110, EPY110],
  },
  {
    id: 'bed-arts-mathematics-business',
    name: 'Bachelor of Education (Arts, with I.T.) - Mathematics & Business Studies',
    units: [UCI101, ESE110, EPY110],
  },
  {
    id: 'bed-arts-business-geography',
    name: 'Bachelor of Education (Arts, with I.T.) - Business Studies & Geography',
    units: [UCI101, ESE110, EPY110],
  },
  {
    id: 'bed-sci-biology-chemistry',
    name: 'Bachelor of Education (Science & Agriculture, with I.T.) - Biology & Chemistry',
    units: [UCI101, ESE110, EPY110],
  },
  {
    id: 'bed-sci-mathematics-chemistry',
    name: 'Bachelor of Education (Science & Agriculture, with I.T.) - Mathematics & Chemistry',
    units: [UCI101, ESE110, EPY110],
  },
  {
    id: 'bed-sci-mathematics-biology',
    name: 'Bachelor of Education (Science & Agriculture, with I.T.) - Mathematics & Biology',
    units: [UCI101, ESE110, EPY110],
  },
  {
    id: 'bed-sci-mathematics-physics',
    name: 'Bachelor of Education (Science & Agriculture, with I.T.) - Mathematics & Physics',
    units: [UCI101, ESE110, EPY110],
  },
  {
    id: 'bed-sci-physics-chemistry',
    name: 'Bachelor of Education (Science & Agriculture, with I.T.) - Physics & Chemistry',
    units: [UCI101, ESE110, EPY110],
  },
  {
    id: 'bed-sci-agriculture-biology',
    name: 'Bachelor of Education (Science & Agriculture, with I.T.) - Agriculture & Biology',
    units: [UCI101, ESE110, EPY110],
  },
  {
    id: 'bed-sci-agriculture-chemistry',
    name: 'Bachelor of Education (Science & Agriculture, with I.T.) - Agriculture & Chemistry',
    units: [UCI101, ESE110, EPY110],
  },
  {
    id: 'bed-sci-biology-geography',
    name: 'Bachelor of Education (Science & Agriculture, with I.T.) - Biology & Geography',
    units: [UCI101, ESE110, EPY110],
  },
];

function findProgramme(name) {
  return PROGRAMMES.find((p) => p.name === name) || null;
}

module.exports = { PROGRAMMES, findProgramme };
