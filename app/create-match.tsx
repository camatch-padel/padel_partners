import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/constants/supabase';
import { DAYS_OF_WEEK, DURATIONS, FORMATS, MONTHS, STEP_TITLES, TIME_SLOTS, VISIBILITY_OPTIONS } from '@/constants/match-constants';
import LevelPyramid from '@/components/LevelPyramid';
import type { Court, Group, MatchFormData } from '@/types/match';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  ImageBackground,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';

const { width } = Dimensions.get('window');

export default function CreateMatchModal() {
  const { backgroundImage, theme } = useTheme();
  const isDark = theme === 'dark';
  // État du formulaire
  const [formData, setFormData] = useState<MatchFormData>({
    date: new Date(),
    timeSlot: '',
    duration: 90, // 1h30 par défaut
    format: 4, // 4 joueurs par défaut
    levelMin: 3.0, // Niveau minimum par défaut
    levelMax: 10.0, // Toujours 10
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

  // Recherche de clubs
  const [clubSearch, setClubSearch] = useState('');

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
      const { error: participantError } = await supabase.from('match_participants').insert({
        match_id: match.id,
        user_id: session.user.id,
      });
      if (participantError) {
        // Best-effort cleanup si l'insert participant echoue apres creation du match
        await supabase.from('matches').delete().eq('id', match.id);
        throw participantError;
      }

      // 4. Succès : afficher message et retour home
      Alert.alert('Succès', 'Votre partie a été créée !', [
        { text: 'OK', onPress: () => router.replace('/(tabs)') }
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

      {Platform.OS === 'ios' ? (
        <View style={[styles.calendarContainer, !isDark && { backgroundColor: 'rgba(255,255,255,0.9)' }]}>
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
            style={[styles.dateButton, !isDark && { backgroundColor: 'rgba(255,255,255,0.9)' }]}
            onPress={() => setShowDatePicker(true)}
          >
            <Ionicons name="calendar" size={32} color="#D4AF37" />
            <Text style={[styles.dateButtonText, !isDark && { color: '#111111' }]}>{formatDate(formData.date)}</Text>
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

      <View style={[styles.selectedDateDisplay, !isDark && { backgroundColor: 'rgba(255,255,255,0.9)' }]}>
        <Ionicons name="calendar" size={20} color="#D4AF37" />
        <Text style={styles.selectedDateText}>{formatDate(formData.date)}</Text>
      </View>
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
              formData.timeSlot === slot && styles.timeSlotSelected,
              !isDark && formData.timeSlot !== slot && { backgroundColor: 'rgba(255,255,255,0.9)' }
            ]}
            onPress={() => setFormData({ ...formData, timeSlot: slot })}
          >
            <Text style={[
              styles.timeSlotText,
              formData.timeSlot === slot && styles.timeSlotTextSelected,
              !isDark && formData.timeSlot !== slot && { color: '#333333' }
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
            minimumTrackTintColor="#D4AF37"
            maximumTrackTintColor="#666666"
            thumbTintColor="#D4AF37"
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
              formData.format === format.value && styles.formatButtonSelected,
              !isDark && formData.format !== format.value && { backgroundColor: 'rgba(255,255,255,0.9)' }
            ]}
            onPress={() => setFormData({ ...formData, format: format.value as 2 | 4 })}
          >
            <Ionicons
              name="people"
              size={40}
              color={formData.format === format.value ? '#000000' : '#D4AF37'}
              style={{ marginBottom: 12 }}
            />
            <Text style={[
              styles.formatText,
              formData.format === format.value && styles.formatTextSelected,
              !isDark && formData.format !== format.value && { color: '#333333' }
            ]}>
              {format.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  // Étape 4 : Niveau minimum requis (triangle vertical)
  const renderStepLevel = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Niveau minimum</Text>
      <Text style={styles.levelHelpText}>Indiquez le niveau minimum souhaité pour votre partie</Text>
      <LevelPyramid
        value={formData.levelMin}
        onChange={(value) => setFormData({ ...formData, levelMin: value, levelMax: 10 })}
      />
    </View>
  );

  // Étape 5 : Club (optionnel)
  const renderStepClub = () => {
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

        <View style={[styles.clubSearchContainer, !isDark && { backgroundColor: 'rgba(255,255,255,0.9)' }]}>
          <Ionicons name="search" size={20} color="#D4AF37" />
          <TextInput
            style={[styles.clubSearchInput, !isDark && { color: '#111111' }]}
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

        {loadingData ? (
          <ActivityIndicator size="large" color="#D4AF37" />
        ) : (
          <ScrollView style={styles.clubList}>
            <Pressable
              style={[
                styles.clubItem,
                formData.clubId === null && styles.clubItemSelected,
                !isDark && formData.clubId !== null && { backgroundColor: 'rgba(255,255,255,0.9)' }
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

            {filteredCourts.map((court) => (
              <Pressable
                key={court.id}
                style={[
                  styles.clubItem,
                  formData.clubId === court.id && styles.clubItemSelected,
                  !isDark && formData.clubId !== court.id && { backgroundColor: 'rgba(255,255,255,0.9)' },
                ]}
                onPress={() => setFormData({ ...formData, clubId: court.id })}
              >
                <Text style={[
                  styles.clubItemName,
                  formData.clubId === court.id && styles.clubItemTextSelected,
                  !isDark && formData.clubId !== court.id && { color: '#111111' }
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

            {filteredCourts.length === 0 && clubSearch.trim() && (
              <Text style={styles.noClubText}>Aucun club trouvé pour "{clubSearch}"</Text>
            )}
          </ScrollView>
        )}
      </View>
    );
  };

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
              formData.visibility === option.value && styles.visibilityButtonSelected,
              !isDark && formData.visibility !== option.value && { backgroundColor: 'rgba(255,255,255,0.9)' }
            ]}
            onPress={() => {
              setFormData({
                ...formData,
                visibility: option.value as 'tous' | 'private',
                groupId: option.value === 'tous' ? null : formData.groupId
              });
            }}
          >
            <Ionicons
              name={option.value === 'tous' ? 'earth' : 'lock-closed'}
              size={32}
              color={formData.visibility === option.value ? '#000000' : '#D4AF37'}
              style={{ marginBottom: 8 }}
            />
            <Text style={[
              styles.visibilityText,
              formData.visibility === option.value && styles.visibilityTextSelected,
              !isDark && formData.visibility !== option.value && { color: '#333333' }
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
            <ActivityIndicator size="small" color="#D4AF37" />
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
                    formData.groupId === group.id && styles.groupItemSelected,
                    !isDark && formData.groupId !== group.id && { backgroundColor: 'rgba(255,255,255,0.9)' },
                  ]}
                  onPress={() => setFormData({ ...formData, groupId: group.id })}
                >
                  <Text style={[
                    styles.groupItemText,
                    formData.groupId === group.id && styles.groupItemTextSelected,
                    !isDark && formData.groupId !== group.id && { color: '#111111' }
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
            <View style={styles.recapLabelContainer}>
              <Ionicons name="calendar" size={20} color="#D4AF37" style={{ marginRight: 8 }} />
              <Text style={styles.recapLabel}>Date</Text>
            </View>
            <Text style={[styles.recapValue, !isDark && { color: '#111111' }]}>{formatDate(formData.date)}</Text>
          </View>

          <View style={styles.recapItem}>
            <View style={styles.recapLabelContainer}>
              <Ionicons name="time" size={20} color="#D4AF37" style={{ marginRight: 8 }} />
              <Text style={styles.recapLabel}>Heure</Text>
            </View>
            <Text style={[styles.recapValue, !isDark && { color: '#111111' }]}>{formData.timeSlot}</Text>
          </View>

          <View style={styles.recapItem}>
            <View style={styles.recapLabelContainer}>
              <Ionicons name="timer" size={20} color="#D4AF37" style={{ marginRight: 8 }} />
              <Text style={styles.recapLabel}>Durée</Text>
            </View>
            <Text style={[styles.recapValue, !isDark && { color: '#111111' }]}>{duration?.label}</Text>
          </View>

          <View style={styles.recapItem}>
            <View style={styles.recapLabelContainer}>
              <Ionicons name="people" size={20} color="#D4AF37" style={{ marginRight: 8 }} />
              <Text style={styles.recapLabel}>Format</Text>
            </View>
            <Text style={[styles.recapValue, !isDark && { color: '#111111' }]}>{formData.format} joueurs</Text>
          </View>

          <View style={styles.recapItem}>
            <View style={styles.recapLabelContainer}>
              <Ionicons name="star" size={20} color="#D4AF37" style={{ marginRight: 8 }} />
              <Text style={styles.recapLabel}>Niveau requis</Text>
            </View>
            <Text style={[styles.recapValue, !isDark && { color: '#111111' }]}>{formData.levelMin.toFixed(1)} - 10.0</Text>
          </View>

          <View style={styles.recapItem}>
            <View style={styles.recapLabelContainer}>
              <Ionicons name="business" size={20} color="#D4AF37" style={{ marginRight: 8 }} />
              <Text style={styles.recapLabel}>Club</Text>
            </View>
            <Text style={[styles.recapValue, !isDark && { color: '#111111' }]}>
              {selectedCourt ? `${selectedCourt.name} - ${selectedCourt.city}` : 'Non spécifié'}
            </Text>
          </View>

          <View style={styles.recapItem}>
            <View style={styles.recapLabelContainer}>
              <Ionicons name="eye" size={20} color="#D4AF37" style={{ marginRight: 8 }} />
              <Text style={styles.recapLabel}>Visibilité</Text>
            </View>
            <Text style={[styles.recapValue, !isDark && { color: '#111111' }]}>
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
    <ImageBackground
      source={backgroundImage}
      style={styles.container}
      resizeMode="cover"
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={28} color="#D4AF37" />
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
            <Pressable style={[styles.footerButton, !isDark && { backgroundColor: 'rgba(255,255,255,0.9)' }]} onPress={goToPreviousStep}>
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
    </ImageBackground>
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
    borderBottomWidth: 1,
    borderBottomColor: '#D4AF37',
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    color: '#D4AF37',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#D4AF37',
  },

  // Progress
  progressContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    marginBottom: 50,
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
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#D4AF37',
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
    borderWidth: 0.8,
    borderColor: '#D4AF37',
  },
  dateButtonIcon: {
    fontSize: 32,
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
    borderWidth: 0.8,
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
    borderWidth: 0.8,
    borderColor: '#D4AF37',
  },
  selectedDateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#D4AF37',
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
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 0.8,
    borderColor: '#D4AF37',
  },
  timeSlotSelected: {
    backgroundColor: '#D4AF37',
    borderColor: '#D4AF37',
  },
  timeSlotText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  timeSlotTextSelected: {
    color: '#000000',
  },

  // Slider steps
  sliderContainer: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  levelLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  sliderValue: {
    fontSize: 48,
    fontWeight: '700',
    color: '#D4AF37',
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
    color: '#AAAAAA',
  },

  // Level
  levelHelpText: {
    fontSize: 14,
    color: '#AAAAAA',
    marginBottom: 20,
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
    color: '#AAAAAA',
    marginBottom: 8,
  },
  rangeValue: {
    fontSize: 36,
    fontWeight: '700',
    color: '#D4AF37',
  },
  rangeValueSeparator: {
    fontSize: 32,
    fontWeight: '700',
    color: '#666666',
  },
  rangeSlider: {
    width: width - 80,
    height: 40,
  },
  thumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#D4AF37',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  rail: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#666666',
  },
  railSelected: {
    height: 4,
    backgroundColor: '#D4AF37',
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
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 0.8,
    borderColor: '#D4AF37',
  },
  formatButtonSelected: {
    backgroundColor: '#D4AF37',
    borderColor: '#D4AF37',
  },
  formatIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  formatText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  formatTextSelected: {
    color: '#000000',
  },

  // Club step
  clubSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderWidth: 0.8,
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
    flex: 1,
  },
  clubItem: {
    padding: 16,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 0.8,
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
    borderWidth: 0.8,
    borderColor: '#D4AF37',
  },
  visibilityButtonSelected: {
    backgroundColor: '#D4AF37',
    borderColor: '#D4AF37',
  },
  visibilityIcon: {
    fontSize: 32,
    marginBottom: 8,
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
    borderWidth: 0.8,
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

  // Recap step
  recapContainer: {
    flex: 1,
  },
  recapItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#D4AF37',
  },
  recapLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recapLabel: {
    fontSize: 16,
    color: '#AAAAAA',
  },
  recapValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'right',
    flex: 1,
    marginLeft: 16,
  },
  createButton: {
    backgroundColor: '#D4AF37',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 0,
    transform: [{ translateY: -80 }],
  },
  createButtonDisabled: {
    backgroundColor: '#666666',
  },
  createButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
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
    backgroundColor: '#1A1A1A',
    borderWidth: 0.8,
    borderColor: '#D4AF37',
  },
  footerButtonNext: {
    backgroundColor: '#D4AF37',
    borderColor: '#D4AF37',
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



