import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const USDA_API_KEY = 'DEMO_KEY' // Free — user can get their own at api.nal.usda.gov

export function useNutrition(householdId) {
  const { user } = useAuth()
  const [profiles, setProfiles] = useState([])
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!householdId) return
    fetchData()
  }, [householdId])

  async function fetchData() {
    const today = new Date().toISOString().split('T')[0]
    const [{ data: profileData }, { data: logData }] = await Promise.all([
      supabase.from('nutrition_profiles').select('*').eq('household_id', householdId),
      supabase.from('consumption_logs').select('*').eq('household_id', householdId).eq('date', today),
    ])
    setProfiles(profileData ?? [])
    setLogs(logData ?? [])
    setLoading(false)
  }

  // Search USDA FoodData Central
  async function searchUSDA(query) {
    try {
      const res = await fetch(
        `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&pageSize=5&api_key=${USDA_API_KEY}`
      )
      const data = await res.json()
      return (data.foods ?? []).map(food => ({
        fdc_id: String(food.fdcId),
        name: food.description,
        calories: getNutrient(food, 1008),
        protein: getNutrient(food, 1003),
        carbohydrates: getNutrient(food, 1005),
        fat: getNutrient(food, 1004),
        fiber: getNutrient(food, 1079),
        sugar: getNutrient(food, 2000),
        sodium: getNutrient(food, 1093),
        serving_size: food.servingSize ? `${food.servingSize}${food.servingSizeUnit ?? 'g'}` : '100g',
      }))
    } catch {
      return []
    }
  }

  function getNutrient(food, nutrientId) {
    const n = food.foodNutrients?.find(n => n.nutrientId === nutrientId)
    return n ? Math.round(n.value * 10) / 10 : null
  }

  async function saveProfile(profileData) {
    const { data, error } = await supabase
      .from('nutrition_profiles')
      .insert({ ...profileData, household_id: householdId })
      .select()
      .single()
    if (!error) setProfiles(p => [...p, data])
    return { data, error }
  }

  async function logConsumption({ item_name, servings_consumed, profile, recipe_id, leftover_id }) {
    const entry = {
      household_id: householdId,
      user_id: user.id,
      date: new Date().toISOString().split('T')[0],
      item_name,
      servings_consumed,
      recipe_id: recipe_id ?? null,
      leftover_id: leftover_id ?? null,
      nutrition_profile_id: profile?.id ?? null,
      calories_total: profile ? (profile.calories ?? 0) * servings_consumed : null,
      protein_total: profile ? (profile.protein ?? 0) * servings_consumed : null,
      carbs_total: profile ? (profile.carbohydrates ?? 0) * servings_consumed : null,
      fat_total: profile ? (profile.fat ?? 0) * servings_consumed : null,
    }
    const { data, error } = await supabase.from('consumption_logs').insert(entry).select().single()
    if (!error) setLogs(l => [...l, data])
    return { data, error }
  }

  async function deleteLog(id) {
    await supabase.from('consumption_logs').delete().eq('id', id)
    setLogs(l => l.filter(x => x.id !== id))
  }

  // Today's totals per user
  function todayTotals() {
    const userLogs = logs.filter(l => l.user_id === user.id)
    return {
      calories: userLogs.reduce((s, l) => s + (l.calories_total ?? 0), 0),
      protein: userLogs.reduce((s, l) => s + (l.protein_total ?? 0), 0),
      carbs: userLogs.reduce((s, l) => s + (l.carbs_total ?? 0), 0),
      fat: userLogs.reduce((s, l) => s + (l.fat_total ?? 0), 0),
    }
  }

  return { profiles, logs, loading, searchUSDA, saveProfile, logConsumption, deleteLog, todayTotals, refetch: fetchData }
}
