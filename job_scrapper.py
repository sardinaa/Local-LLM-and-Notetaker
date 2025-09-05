import time
from jobspy import scrape_jobs
import pandas as pd


search_terms = ["AI Engineer", "AI Developer", "Machine Learning", "Data Scientist", "Computer Vision", "Deep Learning", "NLP", "AI Architect"]
target_locations = ["Sweden", "Switzerland", "Norway", "Ireland", "Germany", "Belgium", "Netherlands", "Luxembourg", "Denmark"]
desired_columns = ["job_url","title","company","location","date_posted","job_type","is_remote","job_level","emails","description","company_logo"]

def run_search(search_terms, target_locations):

    all_results = []

    for search_term in search_terms:
        for location in target_locations:
            
            try:
                jobs = scrape_jobs(
                    site_name=["linkedin", "glassdoor", "indeed"],  # Multiple sites
                    search_term=search_term,
                    google_search_term=f"{search_term} jobs {location} Europe recent",
                    location=location,
                    results_wanted=100,  # Smaller batches for reliability
                    hours_old=24,  # 3 days instead of 24 hours
                    
                    linkedin_fetch_description=True,  # Keep detailed descriptions
                    # proxies=["208.195.175.46:65095"] if needed  # Uncomment if you have proxies
                )
                
                if len(jobs) > 0:
                    jobs['search_query'] = search_term
                    jobs['target_location'] = location
                    all_results.append(jobs)
                    print(f"Found {len(jobs)} jobs")
                else:
                    print(f"No results for this combination")
                    
            except Exception as e:
                print(f"Error: {str(e)}")
                continue
            
            # Rate limiting - important for reliability!
            time.sleep(3)
    
    # Combine and clean results
    if all_results:
        final_jobs = pd.concat(all_results, ignore_index=True)
        
        # Remove duplicates by job URL
        final_jobs = final_jobs.drop_duplicates(subset=['job_url'], keep='first')

        return final_jobs
    else:
        print("No results found")
        return pd.DataFrame()

def extract_job_variables(jobs_df, columns_wanted):
    """
    Extract only the specified columns from the jobs dataframe
    """
    available_columns = [col for col in columns_wanted if col in jobs_df.columns]
    missing_columns = [col for col in columns_wanted if col not in jobs_df.columns]
    
    if missing_columns:
        print(f"Missing columns: {missing_columns}")
    
    # Extract only the available desired columns
    filtered_jobs = jobs_df[available_columns].copy()
    
    return filtered_jobs


jobs = run_search()
filtered_jobs = extract_job_variables(jobs, desired_columns)