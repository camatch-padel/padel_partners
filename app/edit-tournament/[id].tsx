import { supabase } from '@/constants/supabase';
import { DAYS_OF_WEEK, MONTHS, TIME_SLOTS } from '@/constants/match-constants';
import {
  AGE_CATEGORIES,
  EVENT_TYPES,
  PLAYER_POSITIONS,
  TOURNAMENT_CATEGORIES,
  TOURNAMENT_STEP_TITLES,
} from '@/constants/tournament-constants';
import type { Court } from '@/types/match';
import type { TournamentFormData } from '@/types/tournament';
import { Ionicons } from '@expo/vector-icons';
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
  View,
} from 'react-native';

const { width } = Dimensions.get('window');

export default function EditTournamentModal() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [formData, setFormData] = useState<TournamentFormData>({
    date: new Date(),
    timeSlot: '',
    category: 'P100',
    eventType: 'Mixte',
    ageCategory: 'Senior',
    minRanking: 0,
    playerPosition: 'Peu importe',
    clubId: null,
  });

  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [courts, setCourts] = useState<Court[]>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [clubSearch, setClubSearch] = useState('');
  const [rankingText, setRankingText] = useState('0');

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

      // Charger le tournoi existant
      const { data: tournament, error } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      if (tournament) {
        setFormData({
          date: new Date(tournament.date),
          timeSlot: tournament.time_slot || '',
          category: tournament.category,
          eventType: tournament.event_type,
          ageCategory: tournament.age_category,
          minRanking: tournament.min_ranking,
          playerPosition: tournament.player_position,
          clubId: tournament.court_id,
        });
        setRankingText(String(tournament.min_ranking));
      }
    } catch (error) {
      console.error('Erreur chargement données:', error);
      Alert.alert('Erreur', 'Impossible de charger le tournoi');
      router.back();
    } finally {
      setLoadingData(false);
    }
  };

  const goToNextStep = () => {
    if (!validateCurrentStep()) return;
    if (currentStep < TOURNAMENT_STEP_TITLES.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const goToPreviousStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const validateCurrentStep = (): boolean => {
    switch (currentStep) {
      case 0: {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (formData.date < today) {
          Alert.alert('Erreur', "La date doit être aujourd'hui ou dans le futur");
          return false;
        }
        return true;
      }
      case 6: {
        if (formData.minRanking < 0 || formData.minRanking > 999999) {
          Alert.alert('Erreur', 'Le classement doit être entre 0 et 999999');
          return false;
        }
        return true;
      }
      default:
        return true;
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('tournaments')
        .update({
          date: formData.date.toISOString().split('T')[0],
          time_slot: formData.timeSlot || null,
          category: formData.category,
          event_type: formData.eventType,
          age_category: formData.ageCategory,
          min_ranking: formData.minRanking,
          player_position: formData.playerPosition,
          court_id: formData.clubId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      Alert.alert('Succès', 'Recherche de partenaire modifiée !', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      console.error('Erreur modification tournoi:', error);
      Alert.alert('Erreur', error.message || 'Impossible de modifier');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date: Date): string => {
    const dayName = DAYS_OF_WEEK[date.getDay()];
    const day = date.getDate();
    const month = MONTHS[date.getMonth()];
    const year = date.getFullYear();
    return `${dayName} ${day} ${month} ${year}`;
  };

  if (loadingData) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#D4AF37" />
      </View>
    );
  }

  // ================== ÉTAPES (identiques à create-tournament) ==================

  const renderStepDate = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Date du tournoi</Text>
      {Platform.OS === 'ios' ? (
        <View style={styles.calendarContainer}>
          <DateTimePicker
            value={formData.date}
            mode="date"
            display="inline"
            minimumDate={new Date()}
            accentColor="#D4AF37"
            onChange={(_event, selectedDate) => {
              if (selectedDate) setFormData({ ...formData, date: selectedDate });
            }}
          />
        </View>
      ) : (
        <>
          <Pressable style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
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
                if (event.type === 'set' && selectedDate)
                  setFormData({ ...formData, date: selectedDate });
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

  const renderStepTime = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Heure (optionnelle)</Text>
      <Pressable
        style={[styles.noTimeButton, formData.timeSlot === '' && styles.noTimeButtonSelected]}
        onPress={() => setFormData({ ...formData, timeSlot: '' })}
      >
        <Ionicons name="time-outline" size={24} color={formData.timeSlot === '' ? '#000000' : '#D4AF37'} />
        <Text style={[styles.noTimeText, formData.timeSlot === '' && styles.noTimeTextSelected]}>
          Pas d'heure précise
        </Text>
      </Pressable>
      <ScrollView style={styles.timeGrid} contentContainerStyle={styles.timeGridContent}>
        {TIME_SLOTS.map((slot) => (
          <Pressable
            key={slot}
            style={[styles.timeSlot, formData.timeSlot === slot && styles.timeSlotSelected]}
            onPress={() => setFormData({ ...formData, timeSlot: slot })}
          >
            <Text style={[styles.timeSlotText, formData.timeSlot === slot && styles.timeSlotTextSelected]}>
              {slot}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );

  const renderStepClub = () => {
    const searchLower = clubSearch.toLowerCase();
    const filteredCourts = clubSearch.trim()
      ? courts.filter((c) => c.name.toLowerCase().includes(searchLower) || c.city.toLowerCase().includes(searchLower))
      : courts;

    return (
      <View style={styles.stepContainer}>
        <Text style={styles.stepTitle}>Club du tournoi</Text>
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
        <ScrollView style={styles.clubList}>
          <Pressable
            style={[styles.clubItem, formData.clubId === null && styles.clubItemSelected]}
            onPress={() => setFormData({ ...formData, clubId: null })}
          >
            <Text style={[styles.clubItemText, formData.clubId === null && styles.clubItemTextSelected]}>
              Aucun club spécifié
            </Text>
          </Pressable>
          {filteredCourts.map((court) => (
            <Pressable
              key={court.id}
              style={[styles.clubItem, formData.clubId === court.id && styles.clubItemSelected]}
              onPress={() => setFormData({ ...formData, clubId: court.id })}
            >
              <Text style={[styles.clubItemName, formData.clubId === court.id && styles.clubItemTextSelected]}>
                {court.name}
              </Text>
              <Text style={[styles.clubItemCity, formData.clubId === court.id && styles.clubItemTextSelected]}>
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

  const renderStepCategory = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Catégorie du tournoi</Text>
      <View style={styles.optionsGrid}>
        {TOURNAMENT_CATEGORIES.map((cat) => (
          <Pressable
            key={cat.value}
            style={[styles.optionButton, formData.category === cat.value && styles.optionButtonSelected]}
            onPress={() => setFormData({ ...formData, category: cat.value })}
          >
            <Text style={[styles.optionText, formData.category === cat.value && styles.optionTextSelected]}>
              {cat.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const renderStepEventType = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Type d'épreuve</Text>
      <View style={styles.optionsRow}>
        {EVENT_TYPES.map((type) => (
          <Pressable
            key={type.value}
            style={[styles.optionButtonLarge, formData.eventType === type.value && styles.optionButtonSelected]}
            onPress={() => setFormData({ ...formData, eventType: type.value })}
          >
            <Ionicons
              name={type.value === 'Mixte' ? 'people' : type.value === 'Femme' ? 'woman' : 'man'}
              size={32}
              color={formData.eventType === type.value ? '#000000' : '#D4AF37'}
              style={{ marginBottom: 8 }}
            />
            <Text style={[styles.optionText, formData.eventType === type.value && styles.optionTextSelected]}>
              {type.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const renderStepAgeCategory = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Catégorie d'âge</Text>
      <View style={styles.optionsGrid}>
        {AGE_CATEGORIES.map((age) => (
          <Pressable
            key={age.value}
            style={[styles.optionButton, formData.ageCategory === age.value && styles.optionButtonSelected]}
            onPress={() => setFormData({ ...formData, ageCategory: age.value })}
          >
            <Text style={[styles.optionText, formData.ageCategory === age.value && styles.optionTextSelected]}>
              {age.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const renderStepRanking = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Classement minimum</Text>
      <Text style={styles.rankingHelp}>
        Indiquez le classement minimum souhaité pour votre partenaire (0 = pas de minimum)
      </Text>
      <View style={styles.rankingInputContainer}>
        <TextInput
          style={styles.rankingInput}
          value={rankingText}
          onChangeText={(text) => {
            const cleaned = text.replace(/[^0-9]/g, '');
            setRankingText(cleaned);
            const num = parseInt(cleaned) || 0;
            setFormData({ ...formData, minRanking: Math.min(num, 999999) });
          }}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="0"
          placeholderTextColor="#666666"
        />
      </View>
      <Text style={styles.rankingDisplay}>Classement minimum : {formData.minRanking}</Text>
    </View>
  );

  const renderStepPosition = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Position du joueur recherché</Text>
      <View style={styles.optionsRow}>
        {PLAYER_POSITIONS.map((pos) => (
          <Pressable
            key={pos.value}
            style={[styles.optionButtonLarge, formData.playerPosition === pos.value && styles.optionButtonSelected]}
            onPress={() => setFormData({ ...formData, playerPosition: pos.value })}
          >
            <Ionicons
              name={pos.value === 'Droite' ? 'arrow-forward-circle' : pos.value === 'Gauche' ? 'arrow-back-circle' : 'swap-horizontal'}
              size={32}
              color={formData.playerPosition === pos.value ? '#000000' : '#D4AF37'}
              style={{ marginBottom: 8 }}
            />
            <Text style={[styles.optionText, formData.playerPosition === pos.value && styles.optionTextSelected]}>
              {pos.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const renderStepRecap = () => {
    const selectedCourt = courts.find((c) => c.id === formData.clubId);
    return (
      <View style={styles.stepContainer}>
        <Text style={styles.stepTitle}>Récapitulatif</Text>
        <ScrollView style={styles.recapContainer}>
          <View style={styles.recapItem}>
            <View style={styles.recapLabelContainer}>
              <Ionicons name="calendar" size={20} color="#D4AF37" style={{ marginRight: 8 }} />
              <Text style={styles.recapLabel}>Date</Text>
            </View>
            <Text style={styles.recapValue}>{formatDate(formData.date)}</Text>
          </View>
          <View style={styles.recapItem}>
            <View style={styles.recapLabelContainer}>
              <Ionicons name="time" size={20} color="#D4AF37" style={{ marginRight: 8 }} />
              <Text style={styles.recapLabel}>Heure</Text>
            </View>
            <Text style={styles.recapValue}>{formData.timeSlot || 'Non précisée'}</Text>
          </View>
          <View style={styles.recapItem}>
            <View style={styles.recapLabelContainer}>
              <Ionicons name="business" size={20} color="#D4AF37" style={{ marginRight: 8 }} />
              <Text style={styles.recapLabel}>Club</Text>
            </View>
            <Text style={styles.recapValue}>
              {selectedCourt ? `${selectedCourt.name} - ${selectedCourt.city}` : 'Non spécifié'}
            </Text>
          </View>
          <View style={styles.recapItem}>
            <View style={styles.recapLabelContainer}>
              <Ionicons name="trophy" size={20} color="#D4AF37" style={{ marginRight: 8 }} />
              <Text style={styles.recapLabel}>Catégorie</Text>
            </View>
            <Text style={styles.recapValue}>{formData.category}</Text>
          </View>
          <View style={styles.recapItem}>
            <View style={styles.recapLabelContainer}>
              <Ionicons name="people" size={20} color="#D4AF37" style={{ marginRight: 8 }} />
              <Text style={styles.recapLabel}>Type</Text>
            </View>
            <Text style={styles.recapValue}>{formData.eventType}</Text>
          </View>
          <View style={styles.recapItem}>
            <View style={styles.recapLabelContainer}>
              <Ionicons name="person" size={20} color="#D4AF37" style={{ marginRight: 8 }} />
              <Text style={styles.recapLabel}>Âge</Text>
            </View>
            <Text style={styles.recapValue}>{formData.ageCategory}</Text>
          </View>
          <View style={styles.recapItem}>
            <View style={styles.recapLabelContainer}>
              <Ionicons name="podium" size={20} color="#D4AF37" style={{ marginRight: 8 }} />
              <Text style={styles.recapLabel}>Classement min.</Text>
            </View>
            <Text style={styles.recapValue}>{formData.minRanking}</Text>
          </View>
          <View style={styles.recapItem}>
            <View style={styles.recapLabelContainer}>
              <Ionicons name="hand-left" size={20} color="#D4AF37" style={{ marginRight: 8 }} />
              <Text style={styles.recapLabel}>Position</Text>
            </View>
            <Text style={styles.recapValue}>{formData.playerPosition}</Text>
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
            <Text style={styles.createButtonText}>Enregistrer les modifications</Text>
          )}
        </Pressable>
      </View>
    );
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 0: return renderStepDate();
      case 1: return renderStepTime();
      case 2: return renderStepClub();
      case 3: return renderStepCategory();
      case 4: return renderStepEventType();
      case 5: return renderStepAgeCategory();
      case 6: return renderStepRanking();
      case 7: return renderStepPosition();
      case 8: return renderStepRecap();
      default: return null;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={28} color="#D4AF37" />
        </Pressable>
        <Text style={styles.headerTitle}>Modifier la recherche</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.progressContainer}>
        <Text style={styles.progressText}>
          Étape {currentStep + 1}/{TOURNAMENT_STEP_TITLES.length} - {TOURNAMENT_STEP_TITLES[currentStep]}
        </Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${((currentStep + 1) / TOURNAMENT_STEP_TITLES.length) * 100}%` }]} />
        </View>
      </View>

      <View style={styles.content}>{renderCurrentStep()}</View>

      {currentStep < 8 && (
        <View style={styles.footer}>
          {currentStep > 0 && (
            <Pressable style={styles.footerButton} onPress={goToPreviousStep}>
              <Text style={styles.footerButtonText}>← Précédent</Text>
            </Pressable>
          )}
          <View style={{ flex: 1 }} />
          <Pressable style={[styles.footerButton, styles.footerButtonNext]} onPress={goToNextStep}>
            <Text style={[styles.footerButtonText, styles.footerButtonTextNext]}>Suivant →</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20,
    borderBottomWidth: 1, borderBottomColor: '#D4AF37',
  },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#D4AF37' },
  progressContainer: { paddingHorizontal: 20, paddingTop: 16, marginBottom: 24 },
  progressText: { fontSize: 14, color: '#AAAAAA', marginBottom: 8 },
  progressBar: { height: 4, backgroundColor: '#666666', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#D4AF37' },
  content: { flex: 1, paddingHorizontal: 20 },
  stepContainer: { flex: 1 },
  stepTitle: { fontSize: 24, fontWeight: '700', color: '#D4AF37', marginBottom: 30 },

  dateButton: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 24, flexDirection: 'row', alignItems: 'center', gap: 16, borderWidth: 2, borderColor: '#D4AF37' },
  dateButtonText: { fontSize: 18, fontWeight: '600', color: '#FFFFFF', flex: 1 },
  calendarContainer: { backgroundColor: '#1A1A1A', borderRadius: 16, borderWidth: 2, borderColor: '#D4AF37', overflow: 'hidden', padding: 8 },
  selectedDateDisplay: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, paddingVertical: 12, backgroundColor: '#1A1A1A', borderRadius: 12, borderWidth: 2, borderColor: '#D4AF37' },
  selectedDateText: { fontSize: 16, fontWeight: '600', color: '#D4AF37' },

  noTimeButton: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: '#1A1A1A', borderRadius: 12, borderWidth: 2, borderColor: '#D4AF37', marginBottom: 16 },
  noTimeButtonSelected: { backgroundColor: '#D4AF37' },
  noTimeText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  noTimeTextSelected: { color: '#000000' },
  timeGrid: { flex: 1 },
  timeGridContent: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  timeSlot: { width: (width - 64) / 3, paddingVertical: 16, backgroundColor: '#1A1A1A', borderRadius: 12, alignItems: 'center', borderWidth: 2, borderColor: '#D4AF37' },
  timeSlotSelected: { backgroundColor: '#D4AF37', borderColor: '#D4AF37' },
  timeSlotText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  timeSlotTextSelected: { color: '#000000' },

  clubSearchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', borderWidth: 2, borderColor: '#D4AF37', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, gap: 12, marginBottom: 16 },
  clubSearchInput: { flex: 1, fontSize: 16, color: '#FFFFFF' },
  noClubText: { fontSize: 14, color: '#AAAAAA', fontStyle: 'italic', textAlign: 'center', marginTop: 16 },
  clubList: { flex: 1 },
  clubItem: { padding: 16, backgroundColor: '#1A1A1A', borderRadius: 12, marginBottom: 12, borderWidth: 2, borderColor: '#D4AF37' },
  clubItemSelected: { backgroundColor: '#D4AF37', borderColor: '#D4AF37' },
  clubItemText: { fontSize: 16, color: '#FFFFFF' },
  clubItemTextSelected: { color: '#000000' },
  clubItemName: { fontSize: 16, fontWeight: '600', color: '#FFFFFF', marginBottom: 4 },
  clubItemCity: { fontSize: 14, color: '#AAAAAA' },

  optionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  optionButton: { paddingVertical: 16, paddingHorizontal: 24, backgroundColor: '#1A1A1A', borderRadius: 12, borderWidth: 2, borderColor: '#D4AF37', minWidth: (width - 64) / 3, alignItems: 'center' },
  optionButtonSelected: { backgroundColor: '#D4AF37', borderColor: '#D4AF37' },
  optionText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  optionTextSelected: { color: '#000000' },
  optionsRow: { flexDirection: 'row', gap: 12 },
  optionButtonLarge: { flex: 1, paddingVertical: 32, backgroundColor: '#1A1A1A', borderRadius: 16, alignItems: 'center', borderWidth: 2, borderColor: '#D4AF37' },

  rankingHelp: { fontSize: 14, color: '#AAAAAA', marginBottom: 30 },
  rankingInputContainer: { alignItems: 'center', marginBottom: 20 },
  rankingInput: { fontSize: 48, fontWeight: '700', color: '#D4AF37', textAlign: 'center', backgroundColor: '#1A1A1A', borderRadius: 16, borderWidth: 2, borderColor: '#D4AF37', paddingVertical: 24, paddingHorizontal: 40, minWidth: 200 },
  rankingDisplay: { fontSize: 16, color: '#AAAAAA', textAlign: 'center' },

  recapContainer: { flex: 1 },
  recapItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#D4AF37' },
  recapLabelContainer: { flexDirection: 'row', alignItems: 'center' },
  recapLabel: { fontSize: 16, color: '#AAAAAA' },
  recapValue: { fontSize: 16, fontWeight: '600', color: '#FFFFFF', textAlign: 'right', flex: 1, marginLeft: 16 },
  createButton: { backgroundColor: '#D4AF37', paddingVertical: 18, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  createButtonDisabled: { backgroundColor: '#666666' },
  createButtonText: { fontSize: 18, fontWeight: '700', color: '#000000' },

  footer: { flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 40, paddingTop: 20, gap: 12 },
  footerButton: { paddingVertical: 16, paddingHorizontal: 24, borderRadius: 12, backgroundColor: '#1A1A1A', borderWidth: 2, borderColor: '#D4AF37' },
  footerButtonNext: { backgroundColor: '#D4AF37', borderColor: '#D4AF37' },
  footerButtonText: { fontSize: 16, fontWeight: '600', color: '#D4AF37' },
  footerButtonTextNext: { color: '#000000' },
});


