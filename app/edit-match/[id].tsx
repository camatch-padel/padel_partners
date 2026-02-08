import { supabase } from '@/constants/supabase';
import { DAYS_OF_WEEK, DURATIONS, FORMATS, MONTHS, STEP_TITLES, TIME_SLOTS, VISIBILITY_OPTIONS } from '@/constants/match-constants';
import type { Court, Group, MatchFormData } from '@/types/match';
import Slider from '@react-native-community/slider';
import RangeSlider from 'rn-range-slider';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
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

export default function EditMatchModal() {
  const { id } = useLocalSearchParams<{ id: string }>();

  // État du formulaire
  const [formData, setFormData] = useState<MatchFormData>({
    date: new Date(),
    timeSlot: '',
    duration: 90,
    format: 4,
    levelMin: 3.0,
    levelMax: 7.0,
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
  const [initialLoading, setInitialLoading] = useState(true);

  // État pour le DatePicker
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Charger les données de la partie et les données initiales
  useEffect(() => {
    loadMatchData();
    loadInitialData();
  }, [id]);

  const loadMatchData = async () => {
    try {
      const { data: match, error } = await supabase
        .from('matches')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      if (match) {
        setFormData({
          date: new Date(match.date),
          timeSlot: match.time_slot,
          duration: match.duration_minutes,
          format: match.format,
          levelMin: match.level_min,
          levelMax: match.level_max,
          clubId: match.court_id,
          visibility: match.visibility,
          groupId: match.group_id,
        });
      }
    } catch (error) {
      console.error('Erreur chargement match:', error);
      Alert.alert('Erreur', 'Impossible de charger la partie');
      router.back();
    } finally {
      setInitialLoading(false);
    }
  };

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
        const { data: memberData } = await supabase
          .from('group_members')
          .select('group_id')
          .eq('user_id', session.user.id);

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

  // Mise à jour de la partie
  const handleSubmit = async () => {
    setLoading(true);
    try {
      const { error: matchError } = await supabase
        .from('matches')
        .update({
          date: formData.date.toISOString().split('T')[0],
          time_slot: formData.timeSlot,
          duration_minutes: formData.duration,
          format: formData.format,
          level_min: formData.levelMin,
          level_max: formData.levelMax,
          court_id: formData.clubId,
          visibility: formData.visibility,
          group_id: formData.groupId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (matchError) throw matchError;

      Alert.alert('Succès', 'Partie mise à jour !', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible de mettre à jour la partie');
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading || loadingData) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0066FF" />
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

  // Rendu des étapes (même logique que create-match.tsx)
  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return renderDateStep();
      case 1:
        return renderTimeSlotStep();
      case 2:
        return renderDurationStep();
      case 3:
        return renderFormatStep();
      case 4:
        return renderLevelStep();
      case 5:
        return renderClubStep();
      case 6:
        return renderVisibilityStep();
      case 7:
        return renderSummaryStep();
      default:
        return null;
    }
  };

  // Étape 0 : Date
  const renderDateStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Quelle est la date ?</Text>

      <Pressable
        style={styles.dateButton}
        onPress={() => setShowDatePicker(true)}
      >
        <Text style={styles.dateButtonText}>
          {DAYS_OF_WEEK[formData.date.getDay()]} {formData.date.getDate()} {MONTHS[formData.date.getMonth()]} {formData.date.getFullYear()}
        </Text>
      </Pressable>

      {showDatePicker && (
        <DateTimePicker
          value={formData.date}
          mode="date"
          display="default"
          minimumDate={new Date()}
          onChange={(event, selectedDate) => {
            setShowDatePicker(false);
            if (selectedDate) {
              setFormData({ ...formData, date: selectedDate });
            }
          }}
        />
      )}
    </View>
  );

  // Étape 1 : Créneau horaire
  const renderTimeSlotStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>À quelle heure ?</Text>
      <ScrollView style={styles.timeSlotGrid} showsVerticalScrollIndicator={false}>
        <View style={styles.timeSlotRow}>
          {TIME_SLOTS.map((slot) => (
            <Pressable
              key={slot}
              style={[
                styles.timeSlotButton,
                formData.timeSlot === slot && styles.timeSlotButtonSelected,
              ]}
              onPress={() => setFormData({ ...formData, timeSlot: slot })}
            >
              <Text
                style={[
                  styles.timeSlotButtonText,
                  formData.timeSlot === slot && styles.timeSlotButtonTextSelected,
                ]}
              >
                {slot}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );

  // Étape 2 : Durée
  const renderDurationStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Quelle durée ?</Text>
      <Text style={styles.durationValue}>
        {DURATIONS.find(d => d.value === formData.duration)?.label}
      </Text>

      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={2}
        step={1}
        value={DURATIONS.findIndex(d => d.value === formData.duration)}
        onValueChange={(value) => {
          const duration = DURATIONS[Math.round(value)];
          setFormData({ ...formData, duration: duration.value });
        }}
        minimumTrackTintColor="#0066FF"
        maximumTrackTintColor="rgba(255,255,255,0.3)"
        thumbTintColor="#0066FF"
      />

      <View style={styles.sliderLabels}>
        {DURATIONS.map((d) => (
          <Text key={d.value} style={styles.sliderLabel}>{d.label}</Text>
        ))}
      </View>
    </View>
  );

  // Étape 3 : Format
  const renderFormatStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Combien de joueurs ?</Text>
      <View style={styles.formatButtons}>
        {FORMATS.map((format) => (
          <Pressable
            key={format.value}
            style={[
              styles.formatButton,
              formData.format === format.value && styles.formatButtonSelected,
            ]}
            onPress={() => setFormData({ ...formData, format: format.value })}
          >
            <Text
              style={[
                styles.formatButtonIcon,
                formData.format === format.value && styles.formatButtonIconSelected,
              ]}
            >
              {format.icon}
            </Text>
            <Text
              style={[
                styles.formatButtonText,
                formData.format === format.value && styles.formatButtonTextSelected,
              ]}
            >
              {format.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  // Étape 4 : Niveau
  const renderLevelStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Quel niveau requis ?</Text>

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
  );

  // Étape 5 : Club
  const renderClubStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Quel club ?</Text>
      <ScrollView style={styles.clubList} showsVerticalScrollIndicator={false}>
        <Pressable
          style={[
            styles.clubItem,
            formData.clubId === null && styles.clubItemSelected,
          ]}
          onPress={() => setFormData({ ...formData, clubId: null })}
        >
          <Text
            style={[
              styles.clubItemText,
              formData.clubId === null && styles.clubItemTextSelected,
            ]}
          >
            Non spécifié
          </Text>
        </Pressable>

        {courts.map((court) => (
          <Pressable
            key={court.id}
            style={[
              styles.clubItem,
              formData.clubId === court.id && styles.clubItemSelected,
            ]}
            onPress={() => setFormData({ ...formData, clubId: court.id })}
          >
            <Text
              style={[
                styles.clubItemText,
                formData.clubId === court.id && styles.clubItemTextSelected,
              ]}
            >
              {court.name}
            </Text>
            <Text style={styles.clubItemCity}>{court.city}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );

  // Étape 6 : Visibilité
  const renderVisibilityStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Qui peut voir cette partie ?</Text>

      <View style={styles.visibilityButtons}>
        {VISIBILITY_OPTIONS.map((option) => (
          <Pressable
            key={option.value}
            style={[
              styles.visibilityButton,
              formData.visibility === option.value && styles.visibilityButtonSelected,
            ]}
            onPress={() => setFormData({ ...formData, visibility: option.value, groupId: null })}
          >
            <Text
              style={[
                styles.visibilityButtonIcon,
                formData.visibility === option.value && styles.visibilityButtonIconSelected,
              ]}
            >
              {option.icon}
            </Text>
            <Text
              style={[
                styles.visibilityButtonText,
                formData.visibility === option.value && styles.visibilityButtonTextSelected,
              ]}
            >
              {option.label}
            </Text>
            <Text
              style={[
                styles.visibilityButtonDescription,
                formData.visibility === option.value && styles.visibilityButtonDescriptionSelected,
              ]}
            >
              {option.description}
            </Text>
          </Pressable>
        ))}
      </View>

      {formData.visibility === 'private' && (
        <View style={styles.groupSelectionContainer}>
          <Text style={styles.groupSelectionTitle}>Sélectionner un groupe</Text>
          <ScrollView style={styles.groupList} showsVerticalScrollIndicator={false}>
            {groups.length === 0 ? (
              <Text style={styles.noGroupsText}>
                Vous n'êtes membre d'aucun groupe.
              </Text>
            ) : (
              groups.map((group) => (
                <Pressable
                  key={group.id}
                  style={[
                    styles.groupItem,
                    formData.groupId === group.id && styles.groupItemSelected,
                  ]}
                  onPress={() => setFormData({ ...formData, groupId: group.id })}
                >
                  <Text
                    style={[
                      styles.groupItemText,
                      formData.groupId === group.id && styles.groupItemTextSelected,
                    ]}
                  >
                    {group.name}
                  </Text>
                  {group.description && (
                    <Text style={styles.groupItemDescription}>{group.description}</Text>
                  )}
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );

  // Étape 7 : Récapitulatif
  const renderSummaryStep = () => {
    const selectedCourt = courts.find(c => c.id === formData.clubId);
    const selectedGroup = groups.find(g => g.id === formData.groupId);

    return (
      <View style={styles.stepContainer}>
        <Text style={styles.stepTitle}>Récapitulatif</Text>
        <ScrollView style={styles.summary} showsVerticalScrollIndicator={false}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Date</Text>
            <Text style={styles.summaryValue}>
              {DAYS_OF_WEEK[formData.date.getDay()]} {formData.date.getDate()} {MONTHS[formData.date.getMonth()]} {formData.date.getFullYear()}
            </Text>
          </View>

          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Heure</Text>
            <Text style={styles.summaryValue}>{formData.timeSlot}</Text>
          </View>

          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Durée</Text>
            <Text style={styles.summaryValue}>
              {DURATIONS.find(d => d.value === formData.duration)?.label}
            </Text>
          </View>

          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Format</Text>
            <Text style={styles.summaryValue}>
              {FORMATS.find(f => f.value === formData.format)?.label}
            </Text>
          </View>

          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Niveau requis</Text>
            <Text style={styles.summaryValue}>
              {formData.levelMin.toFixed(1)} - {formData.levelMax.toFixed(1)}
            </Text>
          </View>

          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Club</Text>
            <Text style={styles.summaryValue}>
              {selectedCourt ? `${selectedCourt.name} - ${selectedCourt.city}` : 'Non spécifié'}
            </Text>
          </View>

          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Visibilité</Text>
            <Text style={styles.summaryValue}>
              {formData.visibility === 'tous' ? 'Tous' : selectedGroup ? `Groupe : ${selectedGroup.name}` : 'Groupe privé (non sélectionné)'}
            </Text>
          </View>
        </ScrollView>

        <Pressable
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text style={styles.submitButtonText}>Mettre à jour la partie</Text>
          )}
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.closeButton} onPress={() => router.back()}>
          <Text style={styles.closeButtonText}>✕</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Modifier la partie</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      {/* Indicateur de progression */}
      <View style={styles.progressContainer}>
        <Text style={styles.progressText}>
          Étape {currentStep + 1} / {STEP_TITLES.length}
        </Text>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${((currentStep + 1) / STEP_TITLES.length) * 100}%` }
            ]}
          />
        </View>
        <Text style={styles.progressStepTitle}>{STEP_TITLES[currentStep]}</Text>
      </View>

      {/* Contenu de l'étape */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {renderStep()}
      </ScrollView>

      {/* Footer avec boutons de navigation */}
      {currentStep < 7 && (
        <View style={styles.footer}>
          <Pressable
            style={[styles.footerButton, currentStep === 0 && styles.footerButtonDisabled]}
            onPress={goToPreviousStep}
            disabled={currentStep === 0}
          >
            <Text style={styles.footerButtonText}>← Précédent</Text>
          </Pressable>

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

// Les styles sont identiques à create-match.tsx
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: 'white',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: 'white',
  },
  headerPlaceholder: {
    width: 36,
  },
  progressContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  progressText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 8,
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#00D9C0',
    borderRadius: 2,
  },
  progressStepTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#00D9C0',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  stepContainer: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: 'white',
    marginBottom: 32,
  },
  // Date step
  dateButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#0066FF',
  },
  dateButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
    textAlign: 'center',
  },
  // Time slot step
  timeSlotGrid: {
    maxHeight: 400,
  },
  timeSlotRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  timeSlotButton: {
    width: (width - 64) / 3,
    paddingVertical: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  timeSlotButtonSelected: {
    backgroundColor: 'rgba(0,102,255,0.2)',
    borderColor: '#0066FF',
  },
  timeSlotButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  timeSlotButtonTextSelected: {
    color: '#0066FF',
  },
  // Duration step
  durationValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#0066FF',
    textAlign: 'center',
    marginBottom: 40,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  sliderLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
  },
  // Format step
  formatButtons: {
    gap: 16,
  },
  formatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  formatButtonSelected: {
    backgroundColor: 'rgba(0,102,255,0.2)',
    borderColor: '#0066FF',
  },
  formatButtonIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  formatButtonIconSelected: {
    fontSize: 32,
  },
  formatButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  formatButtonTextSelected: {
    color: '#0066FF',
  },
  // Level step
  rangeValueContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
    marginBottom: 40,
  },
  rangeValueBox: {
    alignItems: 'center',
    gap: 8,
  },
  rangeValueLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
  },
  rangeValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#0066FF',
  },
  rangeValueSeparator: {
    fontSize: 24,
    color: 'rgba(255,255,255,0.4)',
  },
  rangeSlider: {
    width: width - 40,
    height: 60,
  },
  thumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#0066FF',
    borderWidth: 3,
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
  // Club step
  clubList: {
    maxHeight: 400,
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
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  clubItemTextSelected: {
    color: '#0066FF',
  },
  clubItemCity: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
  },
  // Visibility step
  visibilityButtons: {
    gap: 16,
  },
  visibilityButton: {
    padding: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  visibilityButtonSelected: {
    backgroundColor: 'rgba(0,102,255,0.2)',
    borderColor: '#0066FF',
  },
  visibilityButtonIcon: {
    fontSize: 32,
    marginBottom: 12,
  },
  visibilityButtonIconSelected: {
    fontSize: 32,
  },
  visibilityButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 8,
  },
  visibilityButtonTextSelected: {
    color: '#0066FF',
  },
  visibilityButtonDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
  },
  visibilityButtonDescriptionSelected: {
    color: 'rgba(0,102,255,0.7)',
  },
  groupSelectionContainer: {
    marginTop: 24,
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
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  groupItemSelected: {
    backgroundColor: 'rgba(0,102,255,0.2)',
    borderColor: '#0066FF',
  },
  groupItemText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  groupItemTextSelected: {
    color: '#0066FF',
  },
  groupItemDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
  },
  noGroupsText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    padding: 20,
  },
  // Summary step
  summary: {
    marginBottom: 24,
  },
  summaryItem: {
    marginBottom: 20,
  },
  summaryLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
  },
  submitButton: {
    backgroundColor: '#0066FF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
  },
  // Footer
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: '#000000',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  footerButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  footerButtonNext: {
    backgroundColor: '#0066FF',
  },
  footerButtonDisabled: {
    opacity: 0.3,
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
