import { supabase } from '@/constants/supabase';
import { DAYS_OF_WEEK, DURATIONS, FORMATS, MONTHS, STEP_TITLES, TIME_SLOTS, VISIBILITY_OPTIONS } from '@/constants/match-constants';
import LevelPyramid from '@/components/LevelPyramid';
import type { Court, Group, MatchFormData } from '@/types/match';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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

  // Recherche de clubs
  const [clubSearch, setClubSearch] = useState('');

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
        <ActivityIndicator size="large" color="#D4AF37" />
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

  const formatDate = (date: Date): string => {
    return `${DAYS_OF_WEEK[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  };

  // Étape 0 : Date
  const renderDateStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Quelle est la date ?</Text>

      {Platform.OS === 'ios' ? (
        <View style={styles.calendarContainer}>
          <DateTimePicker
            value={formData.date}
            mode="date"
            display="inline"
            minimumDate={new Date()}
            accentColor="#D4AF37"
            onChange={(_event, selectedDate) => {
              if (selectedDate) {
                setFormData({ ...formData, date: selectedDate });
              }
            }}
          />
        </View>
      ) : (
        <>
          <Pressable
            style={styles.dateButton}
            onPress={() => setShowDatePicker(true)}
          >
            <Ionicons name="calendar" size={32} color="#D4AF37" />
            <Text style={styles.dateButtonText}>{formatDate(formData.date)}</Text>
          </Pressable>

          {showDatePicker && (
            <DateTimePicker
              value={formData.date}
              mode="date"
              display="calendar"
              minimumDate={new Date()}
              onChange={(event, selectedDate) => {
                if (event.type === 'set' && selectedDate) {
                  setFormData({ ...formData, date: selectedDate });
                }
                setShowDatePicker(false);
              }}
            />
          )}
        </>
      )}

      <View style={styles.selectedDateDisplay}>
        <Ionicons name="calendar" size={20} color="#D4AF37" />
        <Text style={styles.selectedDateText}>{formatDate(formData.date)}</Text>
      </View>
    </View>
  );

  // Étape 1 : Créneau horaire
  const renderTimeSlotStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>À quelle heure ?</Text>

      {formData.timeSlot ? (
        <View style={styles.selectedDateDisplay}>
          <Ionicons name="time" size={20} color="#D4AF37" />
          <Text style={styles.selectedDateText}>{formData.timeSlot}</Text>
        </View>
      ) : null}

      <ScrollView style={[styles.timeSlotGrid, { marginTop: 16 }]} showsVerticalScrollIndicator={false}>
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
        minimumTrackTintColor="#D4AF37"
        maximumTrackTintColor="#666666"
        thumbTintColor="#D4AF37"
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
            onPress={() => setFormData({ ...formData, format: format.value as 2 | 4 })}
          >
            <Ionicons
              name="people"
              size={32}
              color={formData.format === format.value ? '#000000' : '#D4AF37'}
              style={{ marginRight: 16 }}
            />
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

  // Étape 4 : Niveau minimum requis (triangle vertical)
  const renderLevelStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Niveau minimum</Text>
      <Text style={styles.levelHelpText}>Indiquez le niveau minimum souhaité pour votre partie</Text>
      <LevelPyramid
        value={formData.levelMin}
        onChange={(value) => setFormData({ ...formData, levelMin: value, levelMax: 10 })}
      />
    </View>
  );

  // Étape 5 : Club
  const renderClubStep = () => {
    const searchLower = clubSearch.toLowerCase();
    const filteredCourts = clubSearch.trim()
      ? courts.filter(c =>
          c.name.toLowerCase().includes(searchLower) ||
          c.city.toLowerCase().includes(searchLower)
        )
      : courts;

    return (
      <View style={styles.stepContainer}>
        <Text style={styles.stepTitle}>Club (optionnel)</Text>

        <View style={styles.clubSearchContainer}>
          <Ionicons name="search" size={20} color="#D4AF37" />
          <TextInput
            style={styles.clubSearchInput}
            placeholder="Rechercher par nom ou ville..."
            placeholderTextColor="#666666"
            value={clubSearch}
            onChangeText={setClubSearch}
            autoCapitalize="none"
          />
          {clubSearch.length > 0 && (
            <Pressable onPress={() => setClubSearch('')}>
              <Ionicons name="close-circle" size={20} color="#666666" />
            </Pressable>
          )}
        </View>

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
              Aucun club spécifié
            </Text>
          </Pressable>

          {filteredCourts.map((court) => (
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
                  styles.clubItemName,
                  formData.clubId === court.id && styles.clubItemTextSelected,
                ]}
              >
                {court.name}
              </Text>
              <Text
                style={[
                  styles.clubItemCity,
                  formData.clubId === court.id && styles.clubItemTextSelected,
                ]}
              >
                {court.city}
              </Text>
            </Pressable>
          ))}

          {filteredCourts.length === 0 && clubSearch.trim() && (
            <Text style={styles.noClubText}>Aucun club trouvé pour "{clubSearch}"</Text>
          )}
        </ScrollView>
      </View>
    );
  };

  // Étape 6 : Visibilité
  const renderVisibilityStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Visibilité</Text>

      <View style={styles.visibilityContainer}>
        {VISIBILITY_OPTIONS.map((option) => (
          <Pressable
            key={option.value}
            style={[
              styles.visibilityButton,
              formData.visibility === option.value && styles.visibilityButtonSelected,
            ]}
            onPress={() => {
              setFormData({
                ...formData,
                visibility: option.value as 'tous' | 'private',
                groupId: option.value === 'tous' ? null : formData.groupId,
              });
            }}
          >
            <Ionicons
              name={option.value === 'tous' ? 'earth' : 'lock-closed'}
              size={32}
              color={formData.visibility === option.value ? '#000000' : '#D4AF37'}
              style={{ marginBottom: 8 }}
            />
            <Text
              style={[
                styles.visibilityText,
                formData.visibility === option.value && styles.visibilityTextSelected,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {formData.visibility === 'private' && (
        <View style={styles.groupSelectionContainer}>
          <Text style={styles.groupSelectionTitle}>Sélectionnez un groupe :</Text>

          {groups.length === 0 ? (
            <Text style={styles.noGroupText}>
              Vous n'êtes membre d'aucun groupe privé
            </Text>
          ) : (
            <ScrollView style={styles.groupList} showsVerticalScrollIndicator={false}>
              {groups.map((group) => (
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
                </Pressable>
              ))}
            </ScrollView>
          )}
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
              {formData.levelMin.toFixed(1)} - 10.0
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
            <ActivityIndicator size="small" color="#000000" />
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
          <Ionicons name="close" size={24} color="#D4AF37" />
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
    color: '#AAAAAA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#D4AF37',
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#D4AF37',
  },
  headerPlaceholder: {
    width: 40,
  },
  progressContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    marginBottom: 24,
  },
  progressText: {
    fontSize: 14,
    color: '#AAAAAA',
    marginBottom: 8,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#666666',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#D4AF37',
    borderRadius: 2,
  },
  progressStepTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#D4AF37',
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
    color: '#D4AF37',
    marginBottom: 30,
  },

  // Date step
  dateButton: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 2,
    borderColor: '#D4AF37',
  },
  dateButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    flex: 1,
  },
  calendarContainer: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#D4AF37',
    overflow: 'hidden',
    padding: 8,
  },
  selectedDateDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 12,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#D4AF37',
  },
  selectedDateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#D4AF37',
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
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#D4AF37',
  },
  timeSlotButtonSelected: {
    backgroundColor: '#D4AF37',
    borderColor: '#D4AF37',
  },
  timeSlotButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  timeSlotButtonTextSelected: {
    color: '#000000',
  },

  // Duration step
  durationValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#D4AF37',
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
    color: '#AAAAAA',
  },

  // Format step
  formatButtons: {
    gap: 16,
  },
  formatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#D4AF37',
  },
  formatButtonSelected: {
    backgroundColor: '#D4AF37',
    borderColor: '#D4AF37',
  },
  formatButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  formatButtonTextSelected: {
    color: '#000000',
  },

  // Level step
  levelHelpText: {
    fontSize: 14,
    color: '#AAAAAA',
    marginBottom: 20,
  },

  // Club step
  clubSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderWidth: 2,
    borderColor: '#D4AF37',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    marginBottom: 16,
  },
  clubSearchInput: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
  },
  noClubText: {
    fontSize: 14,
    color: '#AAAAAA',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 16,
  },
  clubList: {
    maxHeight: 400,
  },
  clubItem: {
    padding: 16,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#D4AF37',
  },
  clubItemSelected: {
    backgroundColor: '#D4AF37',
    borderColor: '#D4AF37',
  },
  clubItemText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  clubItemTextSelected: {
    color: '#000000',
  },
  clubItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  clubItemCity: {
    fontSize: 14,
    color: '#AAAAAA',
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
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#D4AF37',
  },
  visibilityButtonSelected: {
    backgroundColor: '#D4AF37',
    borderColor: '#D4AF37',
  },
  visibilityText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  visibilityTextSelected: {
    color: '#000000',
  },
  groupSelectionContainer: {
    marginTop: 16,
  },
  groupSelectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#D4AF37',
    marginBottom: 12,
  },
  groupList: {
    maxHeight: 200,
  },
  groupItem: {
    padding: 16,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#D4AF37',
  },
  groupItemSelected: {
    backgroundColor: '#D4AF37',
    borderColor: '#D4AF37',
  },
  groupItemText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  groupItemTextSelected: {
    color: '#000000',
  },
  noGroupText: {
    fontSize: 14,
    color: '#AAAAAA',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 12,
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
    color: '#AAAAAA',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  submitButton: {
    backgroundColor: '#D4AF37',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#666666',
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
  },

  // Footer
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: '#000000',
    borderTopWidth: 1,
    borderTopColor: '#D4AF37',
  },
  footerButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#1A1A1A',
    borderWidth: 2,
    borderColor: '#D4AF37',
    alignItems: 'center',
  },
  footerButtonNext: {
    backgroundColor: '#D4AF37',
    borderColor: '#D4AF37',
  },
  footerButtonDisabled: {
    opacity: 0.3,
  },
  footerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#D4AF37',
  },
  footerButtonTextNext: {
    color: '#000000',
  },
});


