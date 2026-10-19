import React, { useState } from 'react';
import { X, Calendar, Clock, CheckCircle2 } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';

export const VisitScheduleModal: React.FC = () => {
  const { scheduleVisitData, closeScheduleVisit, showToast } = useApp();

  const [date, setDate] = useState('Tomorrow');
  const [timeSlot, setTimeSlot] = useState('5:00 PM - 6:00 PM');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!scheduleVisitData.isOpen) return null;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleVisitData.propertyId || !scheduleVisitData.ownerId) {
      showToast('Missing property or host details', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await api.createVisitRequest({
        propertyId: scheduleVisitData.propertyId,
        ownerId: scheduleVisitData.ownerId,
        preferredDate: date,
        preferredTime: timeSlot,
        message: note.trim(),
      });
      showToast(`Physical visit request submitted for ${date} (${timeSlot})! Host notified.`, 'success');
      closeScheduleVisit();
    } catch (err: any) {
      showToast(err.message || 'Could not schedule visit', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-md p-6 shadow-2xl relative">
        <button
          onClick={closeScheduleVisit}
          className="absolute top-4 right-4 p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-2">
          <Calendar className="w-5 h-5 text-rose-500" />
          <h3 className="text-base font-extrabold text-white">Schedule Physical Walkthrough</h3>
        </div>
        <p className="text-xs text-zinc-400 mb-4">
          Visit <strong className="text-zinc-200">{scheduleVisitData.propertyTitle}</strong>
        </p>

        <form onSubmit={handleConfirm} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-zinc-300 block mb-1">Preferred Day</label>
            <select
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
            >
              <option value="Today">Today (Evening)</option>
              <option value="Tomorrow">Tomorrow</option>
              <option value="This Weekend (Saturday)">This Weekend (Saturday)</option>
              <option value="This Weekend (Sunday)">This Weekend (Sunday)</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-zinc-300 block mb-1">Time Slot</label>
            <select
              value={timeSlot}
              onChange={(e) => setTimeSlot(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
            >
              <option value="11:00 AM - 1:00 PM">11:00 AM - 1:00 PM (Morning)</option>
              <option value="3:00 PM - 5:00 PM">3:00 PM - 5:00 PM (Afternoon)</option>
              <option value="5:00 PM - 6:30 PM">5:00 PM - 6:30 PM (Evening)</option>
              <option value="7:00 PM - 8:30 PM">7:00 PM - 8:30 PM (Post-office)</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-zinc-300 block mb-1">Note for host (optional)</label>
            <input
              type="text"
              placeholder="e.g. Coming with my father to inspect room 101"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 text-white font-extrabold text-xs shadow-lg shadow-rose-500/20 transition-all active:scale-95 disabled:opacity-50"
          >
            {submitting ? 'Submitting Request...' : 'Confirm Visit Request'}
          </button>
        </form>
      </div>
    </div>
  );
};
