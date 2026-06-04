import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { format, addDays, startOfDay } from 'date-fns';

interface DatePickerProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  label?: string;
}

/**
 * Simple custom date picker that presents the next 14 days as selectable
 * chips in a bottom-sheet modal. Avoids native date-picker APIs for maximum
 * cross-platform compatibility and consistent design.
 */
export function DatePicker({
  selectedDate,
  onDateChange,
  label = 'Date',
}: DatePickerProps) {
  const [modalVisible, setModalVisible] = useState(false);

  const today = startOfDay(new Date());
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const displayText = format(selectedDate, 'EEE, d MMM yyyy');

  return (
    <View>
      {/* Trigger button */}
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.8}
        accessibilityLabel={`Selected date: ${displayText}. Tap to change.`}
      >
        <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
        <Text style={styles.triggerText}>{displayText}</Text>
        <Ionicons name="chevron-down" size={14} color={Colors.textSecondary} />
      </TouchableOpacity>

      {/* Bottom-sheet modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          {/* Stop backdrop press from propagating into the sheet */}
          <TouchableOpacity
            style={styles.sheet}
            activeOpacity={1}
            onPress={() => {}}
          >
            <Text style={styles.sheetTitle}>Select Date</Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.daysRow}
            >
              {days.map((day) => {
                const dateKey = format(day, 'yyyy-MM-dd');
                const isSelected =
                  dateKey === format(selectedDate, 'yyyy-MM-dd');
                const isToday = dateKey === format(today, 'yyyy-MM-dd');

                return (
                  <TouchableOpacity
                    key={day.toISOString()}
                    style={[
                      styles.dayChip,
                      isSelected && styles.dayChipSelected,
                    ]}
                    onPress={() => {
                      onDateChange(day);
                      setModalVisible(false);
                    }}
                    accessibilityLabel={format(day, 'EEEE d MMMM yyyy')}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text
                      style={[
                        styles.dayLabel,
                        isSelected && styles.dayLabelSelected,
                      ]}
                    >
                      {format(day, 'EEE')}
                    </Text>
                    <Text
                      style={[
                        styles.dayNumber,
                        isSelected && styles.dayNumberSelected,
                        isToday && !isSelected && styles.dayNumberToday,
                      ]}
                    >
                      {format(day, 'd')}
                    </Text>
                    <Text
                      style={[
                        styles.dayMonth,
                        isSelected && styles.dayMonthSelected,
                      ]}
                    >
                      {format(day, 'MMM')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={styles.doneBtn}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  triggerText: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
  },
  daysRow: {
    paddingHorizontal: 16,
    gap: 10,
    paddingBottom: 4,
  },
  dayChip: {
    width: 64,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dayChipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  dayLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dayLabelSelected: {
    color: 'rgba(255,255,255,0.8)',
  },
  dayNumber: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginVertical: 2,
  },
  dayNumberSelected: {
    color: Colors.white,
  },
  dayNumberToday: {
    color: Colors.accent,
  },
  dayMonth: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  dayMonthSelected: {
    color: 'rgba(255,255,255,0.7)',
  },
  doneBtn: {
    marginTop: 16,
    marginHorizontal: 16,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneBtnText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
});
