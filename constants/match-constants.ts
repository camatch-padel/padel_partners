// Constantes pour la création de parties

// Créneaux horaires disponibles (de 7h à 22h30, par tranches de 30 min)
export const TIME_SLOTS = [
  '07:00', '07:30', '08:00', '08:30', '09:00', '09:30',
  '10:00', '10:30', '11:00', '11:30', '12:00', '12:30',
  '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30', '18:00', '18:30',
  '19:00', '19:30', '20:00', '20:30', '21:00', '21:30',
  '22:00', '22:30',
];

// Durées de partie disponibles
export const DURATIONS = [
  { value: 60, label: '1h' },
  { value: 90, label: '1h30' },
  { value: 120, label: '2h' },
];

// Formats de partie (nombre de joueurs)
export const FORMATS = [
  { value: 2, label: '2 joueurs' },
  { value: 4, label: '4 joueurs' },
];

// Options de visibilité
export const VISIBILITY_OPTIONS = [
  { value: 'tous', label: 'Tous' },
  { value: 'private', label: 'Groupe privé' },
];

// Titres des étapes du formulaire
export const STEP_TITLES = [
  'Date',
  'Heure',
  'Durée',
  'Format',
  'Niveau',
  'Club',
  'Visibilité',
  'Récapitulatif',
];

// Noms des jours de la semaine (pour l'affichage)
export const DAYS_OF_WEEK = [
  'Dimanche',
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
];

// Noms des mois (pour l'affichage)
export const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];
