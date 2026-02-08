import { supabase } from '@/constants/supabase';
import { DAYS_OF_WEEK, DURATIONS, FORMATS, MONTHS, STEP_TITLES, TIME_SLOTS, VISIBILITY_OPTIONS } from '@/constants/match-constants';
import type { Court, Group, MatchFormData } from '@/types/match';
import Slider from '@react-native-community/slider';
import RangeSlider from 'rn-range-slider';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';

const { width } = Dimensions.get('window');

export default function CreateMatchModal() {
  // État du formulaire
  const [formData, setFormData] = useState<MatchFormData>({
    date: new Date(),
    timeSlot: '',
    duration: 90, // 1h30 par défaut
    format: 4, // 4 joueurs par défaut
    levelMin: 3.0, // Niveau minimum par défaut
    levelMax: 7.0, // Niveau maximum par défaut
    clubId: null,
    visibility: 'tous',
    groupId: null,
  });

  // État de navigation
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // Données chargées depuis Supabase
  const [courts, setCourts] = useState<Court[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // État pour le DatePicker
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Charger les clubs et groupes au montage
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      // Charger les clubs
      const { data: courtsData } = await supabase
        .from('courts')
        .select('*')
        .order('city');

      if (courtsData) setCourts(courtsData);

      // Charger les groupes dont l'utilisateur est membre
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // D'abord récupérer les IDs des groupes dont l'utilisateur est membre
        const { data: memberData } = await supabase
          .from('group_members')
          .select('group_id')
          .eq('user_id', session.user.id);

        // Ensuite charger les groupes si l'utilisateur est membre de groupes
        if (memberData && memberData.length > 0) {
          const groupIds = memberData.map(m => m.group_id);
          const { data: groupsData } = await supabase
            .from('groups')
            .select('*')
            .in('id', groupIds);

          if (groupsData) setGroups(groupsData);
        }
      }
    } catch (error) {
      console.error('Erreur chargement données:', error);
    } finally {
      setLoadingData(false);
    }
  };

  // Navigation entre étapes
  const goToNextStep = () => {
    if (!validateCurrentStep()) return;
    if (currentStep < STEP_TITLES.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const goToPreviousStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Validation de l'étape courante
  const validateCurrentStep = (): boolean => {
    switch (currentStep) {
      case 0: // Date
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (formData.date < today) {
          Alert.alert('Erreur', 'La date doit être aujourd\'hui ou dans le futur');
          return false;
        }
        return true;

      case 1: // Heure
        if (!formData.timeSlot) {
          Alert.alert('Erreur', 'Veuillez sélectionner un créneau horaire');
          return false;
        }
        return true;

      case 6: // Visibilité
        if (formData.visibility === 'private' && !formData.groupId) {
          Alert.alert('Erreur', 'Veuillez sélectionner un groupe privé');
          return false;
        }
        return true;

      default:
        return true;
    }
  };

  // Soumission du formulaire
  const handleSubmit = async () => {
    setLoading(true);
    try {
      // 1. Récupérer la session utilisateur
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Non authentifié');

      // 2. Insérer la partie dans la table matches
      const { data: match, error: matchError } = await supabase
        .from('matches')
        .insert({
          creator_id: session.user.id,
          date: formData.date.toISOString().split('T')[0],
          time_slot: formData.timeSlot,
          duration_minutes: formData.duration,
          format: formData.format,
          level_min: formData.levelMin,
          level_max: formData.levelMax,
          court_id: formData.clubId,
          visibility: formData.visibility,
          group_id: formData.groupId,
          status: 'open',
        })
        .select()
        .single();

      if (matchError) throw matchError;

      // 3. Ajouter le créateur comme premier participant
      await supabase.from('match_participants').insert({
        match_id: match.id,
        user_id: session.user.id,
      });

      // 4. Succès : afficher message et retour home
      Alert.alert('Succès', 'Votre partie a été créée !', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error: any) {
      console.error('Erreur création partie:', error);
      Alert.alert('Erreur', error.message || 'Impossible de créer la partie');
    } finally {
      setLoading(false);
    }
  };

  // Formater la date pour l'affichage
  const formatDate = (date: Date): string => {
    const dayName = DAYS_OF_WEEK[date.getDay()];
    const day = date.getDate();
    const month = MONTHS[date.getMonth()];
    const year = date.getFullYear();
    return `${dayName} ${day} ${month} ${year}`;
  };

  // ================== ÉTAPES DU FORMULAIRE ==================

  // Étape 0 : Sélection de la date
  const renderStepDate = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Choisissez la date de la partie</Text>

      <Pressable
        style={styles.dateButton}
        onPress={() => setShowDatePicker(true)}
      >
        <Text style={styles.dateButtonIcon}>📅</Text>
        <Text style={styles.dateButtonText}>{formatDate(formData.date)}</Text>
      </Pressable>

      {showDatePicker && (
        <DateTimePicker
          value={formData.date}
          mode="date"
          display="default"
          minimumDate={new Date()}
          onChange={(event, selectedDate) => {
            // Sur Android, ne fermer que si l'utilisateur a confirmé
            if (event.type === 'set' && selectedDate) {
              setFormData({ ...formData, date: selectedDate });
            }
            setShowDatePicker(false);
          }}
        />
      )}
    </View>
  );

  // Étape 1 : Sélection de l'heure
  const renderStepTime = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Choisissez l'heure</Text>

      <ScrollView style={styles.timeGrid} contentContainerStyle={styles.timeGridContent}>
        {TIME_SLOTS.map((slot) => (
          <Pressable
            key={slot}
            style={[
              styles.timeSlot,
              formData.timeSlot === slot && styles.timeSlotSelected
            ]}
            onPress={() => setFormData({ ...formData, timeSlot: slot })}
          >
            <Text style={[
              styles.timeSlotText,
              formData.timeSlot === slot && styles.timeSlotTextSelected
            ]}>
              {slot}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );

  // Étape 2 : Durée
  const renderStepDuration = () => {
    const durationIndex = DURATIONS.findIndex(d => d.value === formData.duration);

    return (
      <View style={styles.stepContainer}>
        <Text style={styles.stepTitle}>Durée de la partie</Text>

        <View style={styles.sliderContainer}>
          <Text style={styles.sliderValue}>
            {DURATIONS.find(d => d.value === formData.duration)?.label || '1h30'}
          </Text>

          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={2}
            step={1}
            value={durationIndex}
            onValueChange={(value) => {
              setFormData({ ...formData, duration: DURATIONS[value].value });
            }}
            minimumTrackTintColor="#0066FF"
            maximumTrackTintColor="rgba(255,255,255,0.3)"
            thumbTintColor="#0066FF"
          />

          <View style={styles.sliderLabels}>
            {DURATIONS.map((duration) => (
              <Text key={duration.value} style={styles.sliderLabel}>
                {duration.label}
              </Text>
            ))}
          </View>
        </View>
      </View>
    );
  };

  // Étape 3 : Format (2 ou 4 joueurs)
  const renderStepFormat = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Format de la partie</Text>

      <View style={styles.formatContainer}>
        {FORMATS.map((format) => (
          <Pressable
            key={format.value}
            style={[
              styles.formatButton,
              formData.format === format.value && styles.formatButtonSelected
            ]}
            onPress={() => setFormData({ ...formData, format: format.value as 2 | 4 })}
          >
            <Text style={styles.formatIcon}>
              {format.value === 2 ? '👥' : '👥👥'}
            </Text>
            <Text style={[
              styles.formatText,
              formData.format === format.value && styles.formatTextSelected
            ]}>
              {format.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  // Étape 4 : Niveau requis (min et max)
  const renderStepLevel = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Niveau requis</Text>

      <View style={styles.sliderContainer}>
        <View style={styles.rangeValueContainer}>
          <View style={styles.rangeValueBox}>
            <Text style={styles.rangeValueLabel}>Min</Text>
            <Text style={styles.rangeValue}>{formData.levelMin.toFixed(1)}</Text>
          </View>
          <Text style={styles.rangeValueSeparator}>-</Text>
          <View style={styles.rangeValueBox}>
            <Text style={styles.rangeValueLabel}>Max</Text>
            <Text style={styles.rangeValue}>{formData.levelMax.toFixed(1)}</Text>
          </View>
        </View>

        <RangeSlider
          style={styles.rangeSlider}
          min={1}
          max={10}
          step={0.1}
          low={formData.levelMin}
          high={formData.levelMax}
          floatingLabel
          renderThumb={() => <View style={styles.thumb} />}
          renderRail={() => <View style={styles.rail} />}
          renderRailSelected={() => <View style={styles.railSelected} />}
          onValueChanged={(low, high) => {
            const newMin = Math.round(low * 10) / 10;
            const newMax = Math.round(high * 10) / 10;
            // Only update state if values have actually changed
            if (newMin !== formData.levelMin || newMax !== formData.levelMax) {
              setFormData({
                ...formData,
                levelMin: newMin,
                levelMax: newMax,
              });
            }
          }}
        />

        <View style={styles.sliderLabels}>
          <Text style={styles.sliderLabel}>Débutant (1)</Text>
          <Text style={styles.sliderLabel}>Expert (10)</Text>
        </View>
      </View>
    </View>
  );

  // Étape 5 : Club (optionnel)
  const renderStepClub = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Club (optionnel)</Text>

      {loadingData ? (
        <ActivityIndicator size="large" color="#0066FF" />
      ) : (
        <ScrollView style={styles.clubList}>
          <Pressable
            style={[
              styles.clubItem,
              formData.clubId === null && styles.clubItemSelected
            ]}
            onPress={() => setFormData({ ...formData, clubId: null })}
          >
            <Text style={[
              styles.clubItemText,
              formData.clubId === null && styles.clubItemTextSelected
            ]}>
              Aucun club spécifié
            </Text>
          </Pressable>

          {courts.map((court) => (
            <Pressable
              key={court.id}
              style={[
                styles.clubItem,
                formData.clubId === court.id && styles.clubItemSelected
              ]}
              onPress={() => setFormData({ ...formData, clubId: court.id })}
            >
              <Text style={[
                styles.clubItemName,
                formData.clubId === court.id && styles.clubItemTextSelected
              ]}>
                {court.name}
              </Text>
              <Text style={[
                styles.clubItemCity,
                formData.clubId === court.id && styles.clubItemTextSelected
              ]}>
                {court.city}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );

  // Étape 6 : Visibilité
  const renderStepVisibility = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Visibilité</Text>

      <View style={styles.visibilityContainer}>
        {VISIBILITY_OPTIONS.map((option) => (
          <Pressable
            key={option.value}
            style={[
              styles.visibilityButton,
              formData.visibility === option.value && styles.visibilityButtonSelected
            ]}
            onPress={() => {
              setFormData({
                ...formData,
                visibility: option.value as 'tous' | 'private',
                groupId: option.value === 'tous' ? null : formData.groupId
              });
            }}
          >
            <Text style={styles.visibilityIcon}>
              {option.value === 'tous' ? '🌍' : '🔒'}
            </Text>
            <Text style={[
              styles.visibilityText,
              formData.visibility === option.value && styles.visibilityTextSelected
            ]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {formData.visibility === 'private' && (
        <View style={styles.groupSelectionContainer}>
          <Text style={styles.groupSelectionTitle}>Sélectionnez un groupe :</Text>

          {loadingData ? (
            <ActivityIndicator size="small" color="#0066FF" />
          ) : groups.length === 0 ? (
            <Text style={styles.noGroupText}>
              Vous n'êtes membre d'aucun groupe privé
            </Text>
          ) : (
            <ScrollView style={styles.groupList}>
              {groups.map((group) => (
                <Pressable
                  key={group.id}
                  style={[
                    styles.groupItem,
                    formData.groupId === group.id && styles.groupItemSelected
                  ]}
                  onPress={() => setFormData({ ...formData, groupId: group.id })}
                >
                  <Text style={[
                    styles.groupItemText,
                    formData.groupId === group.id && styles.groupItemTextSelected
                  ]}>
                    {group.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );

  // Étape 7 : Récapitulatif
  const renderStepRecap = () => {
    const selectedCourt = courts.find(c => c.id === formData.clubId);
    const selectedGroup = groups.find(g => g.id === formData.groupId);
    const duration = DURATIONS.find(d => d.value === formData.duration);

    return (
      <View style={styles.stepContainer}>
        <Text style={styles.stepTitle}>Récapitulatif</Text>

        <ScrollView style={styles.recapContainer}>
          <View style={styles.recapItem}>
            <Text style={styles.recapLabel}>📅 Date</Text>
            <Text style={styles.recapValue}>{formatDate(formData.date)}</Text>
          </View>

          <View style={styles.recapItem}>
            <Text style={styles.recapLabel}>🕐 Heure</Text>
            <Text style={styles.recapValue}>{formData.timeSlot}</Text>
          </View>

          <View style={styles.recapItem}>
            <Text style={styles.recapLabel}>⏱️ Durée</Text>
            <Text style={styles.recapValue}>{duration?.label}</Text>
          </View>

          <View style={styles.recapItem}>
            <Text style={styles.recapLabel}>👥 Format</Text>
            <Text style={styles.recapValue}>{formData.format} joueurs</Text>
          </View>

          <View style={styles.recapItem}>
            <Text style={styles.recapLabel}>⭐ Niveau requis</Text>
            <Text style={styles.recapValue}>{formData.levelMin.toFixed(1)} - {formData.levelMax.toFixed(1)}</Text>
          </View>

          <View style={styles.recapItem}>
            <Text style={styles.recapLabel}>🏟️ Club</Text>
            <Text style={styles.recapValue}>
              {selectedCourt ? `${selectedCourt.name} - ${selectedCourt.city}` : 'Non spécifié'}
            </Text>
          </View>

          <View style={styles.recapItem}>
            <Text style={styles.recapLabel}>👁️ Visibilité</Text>
            <Text style={styles.recapValue}>
              {formData.visibility === 'tous'
                ? 'Tous'
                : selectedGroup
                  ? `Groupe : ${selectedGroup.name}`
                  : 'Groupe privé'}
            </Text>
          </View>
        </ScrollView>

        <Pressable
          style={[styles.createButton, loading && styles.createButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.createButtonText}>Créer la partie</Text>
          )}
        </Pressable>
      </View>
    );
  };

  // Rendu de l'étape courante
  const renderCurrentStep = () => {
    switch (currentStep) {
      case 0: return renderStepDate();
      case 1: return renderStepTime();
      case 2: return renderStepDuration();
      case 3: return renderStepFormat();
      case 4: return renderStepLevel();
      case 5: return renderStepClub();
      case 6: return renderStepVisibility();
      case 7: return renderStepRecap();
      default: return null;
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <Text style={styles.closeButtonText}>✕</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Créer une partie</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Indicateur de progression */}
      <View style={styles.progressContainer}>
        <Text style={styles.progressText}>
          Étape {currentStep + 1}/{STEP_TITLES.length} - {STEP_TITLES[currentStep]}
        </Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${((currentStep + 1) / STEP_TITLES.length) * 100}%` }]} />
        </View>
      </View>

      {/* Contenu de l'étape */}
      <View style={styles.content}>
        {renderCurrentStep()}
      </View>

      {/* Footer avec boutons de navigation */}
      {currentStep < 7 && (
        <View style={styles.footer}>
          {currentStep > 0 && (
            <Pressable style={styles.footerButton} onPress={goToPreviousStep}>
              <Text style={styles.footerButtonText}>← Précédent</Text>
            </Pressable>
          )}

          <View style={{ flex: 1 }} />

          <Pressable
            style={[styles.footerButton, styles.footerButtonNext]}
            onPress={goToNextStep}
          >
            <Text style={[styles.footerButtonText, styles.footerButtonTextNext]}>
              Suivant →
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    color: 'white',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: 'white',
  },

  // Progress
  progressContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  progressText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 8,
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#0066FF',
  },

  // Content
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  stepContainer: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: 'white',
    marginBottom: 30,
  },

  // Date step
  dateButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 2,
    borderColor: '#0066FF',
  },
  dateButtonIcon: {
    fontSize: 32,
  },
  dateButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
    flex: 1,
  },

  // Time step
  timeGrid: {
    flex: 1,
  },
  timeGridContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  timeSlot: {
    width: (width - 64) / 3,
    paddingVertical: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  timeSlotSelected: {
    backgroundColor: 'rgba(0,102,255,0.2)',
    borderColor: '#0066FF',
  },
  timeSlotText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  timeSlotTextSelected: {
    color: '#0066FF',
  },

  // Slider steps
  sliderContainer: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  levelLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
    marginBottom: 12,
  },
  sliderValue: {
    fontSize: 48,
    fontWeight: '700',
    color: '#0066FF',
    marginBottom: 40,
  },
  slider: {
    width: width - 80,
    height: 40,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: width - 80,
    marginTop: 16,
  },
  sliderLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
  },

  // Range slider
  rangeValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
    gap: 20,
  },
  rangeValueBox: {
    alignItems: 'center',
  },
  rangeValueLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 8,
  },
  rangeValue: {
    fontSize: 36,
    fontWeight: '700',
    color: '#00D9C0',
  },
  rangeValueSeparator: {
    fontSize: 32,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.3)',
  },
  rangeSlider: {
    width: width - 80,
    height: 40,
  },
  thumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#0066FF',
    borderWidth: 2,
    borderColor: 'white',
  },
  rail: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  railSelected: {
    height: 4,
    backgroundColor: '#00D9C0',
    borderRadius: 2,
  },

  // Format step
  formatContainer: {
    flexDirection: 'row',
    gap: 16,
  },
  formatButton: {
    flex: 1,
    paddingVertical: 32,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  formatButtonSelected: {
    backgroundColor: 'rgba(0,102,255,0.2)',
    borderColor: '#0066FF',
  },
  formatIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  formatText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  formatTextSelected: {
    color: '#0066FF',
  },

  // Club step
  clubList: {
    flex: 1,
  },
  clubItem: {
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  clubItemSelected: {
    backgroundColor: 'rgba(0,102,255,0.2)',
    borderColor: '#0066FF',
  },
  clubItemText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
  },
  clubItemTextSelected: {
    color: '#0066FF',
  },
  clubItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 4,
  },
  clubItemCity: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
  },

  // Visibility step
  visibilityContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  visibilityButton: {
    flex: 1,
    paddingVertical: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  visibilityButtonSelected: {
    backgroundColor: 'rgba(0,102,255,0.2)',
    borderColor: '#0066FF',
  },
  visibilityIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  visibilityText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  visibilityTextSelected: {
    color: '#0066FF',
  },
  groupSelectionContainer: {
    marginTop: 16,
  },
  groupSelectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 12,
  },
  groupList: {
    maxHeight: 200,
  },
  groupItem: {
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  groupItemSelected: {
    backgroundColor: 'rgba(0,102,255,0.2)',
    borderColor: '#0066FF',
  },
  groupItemText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
  },
  groupItemTextSelected: {
    color: '#0066FF',
  },
  noGroupText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 12,
  },

  // Recap step
  recapContainer: {
    flex: 1,
  },
  recapItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  recapLabel: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
  },
  recapValue: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    textAlign: 'right',
    flex: 1,
    marginLeft: 16,
  },
  createButton: {
    backgroundColor: '#00D9C0',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  createButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },

  // Footer
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 20,
    gap: 12,
  },
  footerButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  footerButtonNext: {
    backgroundColor: '#0066FF',
  },
  footerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  footerButtonTextNext: {
    color: 'white',
  },
});
