using System.ComponentModel.DataAnnotations;

namespace FbiApi.Models.Entities;

public class WantedPerson
{
    [Key]
    public int Id { get; set; } // ID intern (PK)

    // Identificatori FBI
    public string ExternalId { get; set; } // 'uid' din JSON (ex: "de4766a4...")
    public string PathId { get; set; } // 'pathId' din JSON

    // Informații Generale
    public string? Title { get; set; } // 'title' (ex: "TERRY MATTHEWS")
    public string? Description { get; set; } // 'description'
    public string? Details { get; set; } // 'details' (HTML content)
    public string? Caution { get; set; } // 'caution' (HTML content)
    public string? Remarks { get; set; } // 'remarks'
    
    // Status & Clasificare
    public string? Status { get; set; } // 'status' (ex: "na", "located")
    public string? PersonClassification { get; set; } // 'person_classification' (ex: "Main", "Victim")
    public string? WarningMessage { get; set; } // 'warning_message'

    // Recompense
    public string? RewardText { get; set; } // 'reward_text'
    public int? RewardMin { get; set; } // 'reward_min'
    public int? RewardMax { get; set; } // 'reward_max'

    // Caracteristici Fizice
    public string? Sex { get; set; }
    public string? Race { get; set; } // 'race_raw' sau 'race'
    public string? Hair { get; set; }
    public string? Eyes { get; set; }
    public int? HeightMin { get; set; }
    public int? HeightMax { get; set; }
    public int? WeightMin { get; set; }
    public int? WeightMax { get; set; }
    public string? ScarsAndMarks { get; set; } // 'scars_and_marks'
    public string? Complexion { get; set; }
    public string? Build { get; set; }

    // Origine
    public string? Nationality { get; set; }
    public string? PlaceOfBirth { get; set; }
    
    // Date (NCIC = National Crime Information Center ID)
    public string? Ncic { get; set; } 
    public DateTime? PublicationDate { get; set; } // 'publication'
    public DateTime? ModifiedDate { get; set; } // 'modified'

    // --- RELAȚII (One-to-Many) ---
    // O persoană poate avea mai multe poze, alias-uri, infracțiuni, etc.
    public List<WantedImage> Images { get; set; } = new();
    public List<WantedAlias> Aliases { get; set; } = new();
    public List<WantedSubject> Subjects { get; set; } = new(); // Infracțiunile (ex: "Cyber's Most Wanted")
    public List<WantedFile> Files { get; set; } = new(); // PDF-urile asociate

    public List<SaveWantedPerson> SaveWantedPersons {get; set;} = new();

    public List<LocationWantedPerson> LocationWantedPersons {get; set;} = new();
}