/**
 * Chart.js Integration for LeadSync Dashboard
 * Visualizes Skill Gap Radar and Suitability Gauges for White Theme
 */

let activeRadarChart = null;

function renderRadarChart(canvasId, candidateSkills, benchmarkSkills, candidateName, roleTitle) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (activeRadarChart) {
    activeRadarChart.destroy();
  }

  const labels = Object.keys(benchmarkSkills);
  const benchmarkValues = labels.map(key => benchmarkSkills[key] || 70);
  const candidateValues = labels.map(key => candidateSkills[key] || 50);

  const ctx = canvas.getContext('2d');
  activeRadarChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: labels,
      datasets: [
        {
          label: `${candidateName || 'Candidate'} Actual`,
          data: candidateValues,
          fill: true,
          backgroundColor: 'rgba(79, 70, 229, 0.18)',
          borderColor: '#4f46e5',
          pointBackgroundColor: '#4f46e5',
          pointBorderColor: '#ffffff',
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderColor: '#4f46e5',
          borderWidth: 2.2
        },
        {
          label: `${roleTitle || 'Role'} Benchmark`,
          data: benchmarkValues,
          fill: true,
          backgroundColor: 'rgba(2, 132, 199, 0.12)',
          borderColor: '#0284c7',
          pointBackgroundColor: '#0284c7',
          pointBorderColor: '#ffffff',
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderColor: '#0284c7',
          borderWidth: 2,
          borderDash: [4, 4]
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          angleLines: {
            color: 'rgba(15, 23, 42, 0.08)'
          },
          grid: {
            color: 'rgba(15, 23, 42, 0.08)'
          },
          pointLabels: {
            color: '#334155',
            font: {
              family: "'Inter', sans-serif",
              size: 11,
              weight: '600'
            }
          },
          ticks: {
            display: false,
            stepSize: 20,
            backdropColor: 'transparent'
          },
          suggestedMin: 0,
          suggestedMax: 100
        }
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#334155',
            font: {
              family: "'Inter', sans-serif",
              size: 12,
              weight: '500'
            },
            padding: 16,
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        tooltip: {
          backgroundColor: '#0f172a',
          borderColor: '#e2e8f0',
          borderWidth: 1,
          titleColor: '#f8fafc',
          bodyColor: '#e2e8f0',
          padding: 10,
          displayColors: true
        }
      }
    }
  });
}

let activeAIMatchRadarChart = null;

function renderAIMatchRadarChart(canvasId, labels, candidateScores, benchmarkScores, candidateName, roleTitle) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (activeAIMatchRadarChart) {
    activeAIMatchRadarChart.destroy();
  }

  const ctx = canvas.getContext('2d');
  activeAIMatchRadarChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: labels,
      datasets: [
        {
          label: `${candidateName || 'Perfect Candidate'} Proficiency`,
          data: candidateScores,
          fill: true,
          backgroundColor: 'rgba(16, 185, 129, 0.20)',
          borderColor: '#059669',
          pointBackgroundColor: '#059669',
          pointBorderColor: '#ffffff',
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderColor: '#059669',
          borderWidth: 2.5
        },
        {
          label: `${roleTitle || 'Target Role'} Required Benchmark`,
          data: benchmarkScores,
          fill: true,
          backgroundColor: 'rgba(124, 58, 237, 0.12)',
          borderColor: '#7c3aed',
          pointBackgroundColor: '#7c3aed',
          pointBorderColor: '#ffffff',
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderColor: '#7c3aed',
          borderWidth: 2,
          borderDash: [5, 4]
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          angleLines: { color: 'rgba(15, 23, 42, 0.08)' },
          grid: { color: 'rgba(15, 23, 42, 0.08)' },
          pointLabels: {
            color: '#1e293b',
            font: { family: "'Inter', sans-serif", size: 11, weight: '600' }
          },
          ticks: { display: false, stepSize: 20, backdropColor: 'transparent' },
          suggestedMin: 0,
          suggestedMax: 100
        }
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#334155',
            font: { family: "'Inter', sans-serif", size: 12, weight: '600' },
            padding: 16,
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        tooltip: {
          backgroundColor: '#0f172a',
          borderColor: '#e2e8f0',
          borderWidth: 1,
          titleColor: '#f8fafc',
          bodyColor: '#e2e8f0',
          padding: 10,
          displayColors: true
        }
      }
    }
  });
}

let activeHRAIRadarChart = null;

function renderHRAIRadarChart(canvasId, labels, candidateScores, benchmarkScores, candidateName, roleTitle) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (activeHRAIRadarChart) {
    activeHRAIRadarChart.destroy();
  }

  const ctx = canvas.getContext('2d');
  activeHRAIRadarChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: labels,
      datasets: [
        {
          label: `${candidateName || 'Candidate'} Actual Proficiency`,
          data: candidateScores,
          fill: true,
          backgroundColor: 'rgba(79, 70, 229, 0.20)',
          borderColor: '#4f46e5',
          pointBackgroundColor: '#4f46e5',
          pointBorderColor: '#ffffff',
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderColor: '#4f46e5',
          borderWidth: 2.5
        },
        {
          label: `${roleTitle || 'Target Role'} Required Benchmark`,
          data: benchmarkScores,
          fill: true,
          backgroundColor: 'rgba(236, 72, 153, 0.12)',
          borderColor: '#ec4899',
          pointBackgroundColor: '#ec4899',
          pointBorderColor: '#ffffff',
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderColor: '#ec4899',
          borderWidth: 2,
          borderDash: [5, 4]
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          angleLines: { color: 'rgba(15, 23, 42, 0.08)' },
          grid: { color: 'rgba(15, 23, 42, 0.08)' },
          pointLabels: {
            color: '#1e293b',
            font: { family: "'Inter', sans-serif", size: 11, weight: '600' }
          },
          ticks: { display: false, stepSize: 20, backdropColor: 'transparent' },
          suggestedMin: 0,
          suggestedMax: 100
        }
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#334155',
            font: { family: "'Inter', sans-serif", size: 12, weight: '600' },
            padding: 16,
            usePointStyle: true,
            pointStyle: 'circle'
          }
        }
      }
    }
  });
}

window.renderRadarChart = renderRadarChart;
window.renderAIMatchRadarChart = renderAIMatchRadarChart;
window.renderHRAIRadarChart = renderHRAIRadarChart;

